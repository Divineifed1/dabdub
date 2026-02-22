import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import {
  COMPLIANCE_REPORT_JOB,
  COMPLIANCE_REPORT_QUEUE,
  ComplianceReportJob,
} from '../interfaces/compliance-report-job.interface';
import { ComplianceService } from '../services/compliance.service';
import { ComplianceStorageService } from '../services/compliance-storage.service';
import { ReportBuilderService } from '../services/report-builder.service';
import { ComplianceEmailService } from '../services/compliance-email.service';

@Processor(COMPLIANCE_REPORT_QUEUE)
export class ComplianceReportProcessor extends WorkerHost {
  private readonly logger = new Logger(ComplianceReportProcessor.name);

  constructor(
    private readonly complianceService: ComplianceService,
    private readonly storageService: ComplianceStorageService,
    private readonly reportBuilder: ReportBuilderService,
    private readonly emailService: ComplianceEmailService,
  ) {
    super();
  }

  async process(job: Job<ComplianceReportJob>): Promise<void> {
    const {
      reportId,
      reportType,
      format,
      startDate,
      endDate,
      merchantId,
      requestedByEmail,
    } = job.data;

    this.logger.log(
      `Processing compliance report job: ${reportId} (${reportType}, ${format})`,
    );

    try {
      // 1. Build report content
      const { content, rowCount } = await this.reportBuilder.build(
        reportType,
        format,
        startDate,
        endDate,
        merchantId,
      );

      // 2. Upload to S3
      const { contentType, extension } = ComplianceStorageService.contentTypeFor(format);
      const { s3Key, fileSizeBytes } = await this.storageService.uploadReport(
        reportId,
        content,
        contentType,
        extension,
      );

      // 3. Update DB record
      await this.complianceService.markCompleted(reportId, s3Key, rowCount, fileSizeBytes);

      // 4. Generate presigned URL for email
      const downloadUrl = await this.storageService.getPresignedDownloadUrl(s3Key);
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      // 5. Notify requester
      await this.emailService.sendReportReady(
        requestedByEmail,
        reportId,
        reportType,
        rowCount,
        downloadUrl,
        expiresAt,
      );

      this.logger.log(
        `Compliance report ${reportId} completed: ${rowCount} rows, ${fileSizeBytes} bytes`,
      );
    } catch (err: unknown) {
      const errorMessage =
        err instanceof Error ? err.message : 'Unknown error during report generation';

      this.logger.error(`Compliance report ${reportId} FAILED: ${errorMessage}`, err instanceof Error ? err.stack : undefined);

      // Mark as failed in DB
      await this.complianceService.markFailed(reportId, errorMessage);

      // Send failure email
      try {
        await this.emailService.sendReportFailed(
          requestedByEmail,
          reportId,
          reportType,
          errorMessage,
        );
      } catch (emailErr) {
        this.logger.error('Failed to send failure notification email', emailErr);
      }

      // Re-throw so BullMQ can handle retries
      throw err;
    }
  }
}
