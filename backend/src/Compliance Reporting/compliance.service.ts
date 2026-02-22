import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ComplianceReport } from '../entities/compliance-report.entity';
import { GenerateComplianceReportDto } from '../dto/generate-compliance-report.dto';
import { PaginationQueryDto } from '../dto/pagination-query.dto';
import {
  ComplianceReportStatus,
  ComplianceReportType,
} from '../enums/compliance-report.enum';
import {
  COMPLIANCE_REPORT_JOB,
  COMPLIANCE_REPORT_QUEUE,
  ComplianceReportJob,
} from '../interfaces/compliance-report-job.interface';
import { ComplianceStorageService } from './compliance-storage.service';

/** Maximum date ranges per report type (in days) */
const MAX_DATE_RANGE_DAYS: Record<ComplianceReportType, number> = {
  [ComplianceReportType.TRANSACTION_REPORT]: 365,
  [ComplianceReportType.MERCHANT_DUE_DILIGENCE]: 90,
  [ComplianceReportType.AML_SUMMARY]: 90,
  [ComplianceReportType.FEE_REPORT]: 90,
  [ComplianceReportType.SETTLEMENT_REPORT]: 90,
};

interface RequestingUser {
  id: string;
  email: string;
}

@Injectable()
export class ComplianceService {
  private readonly logger = new Logger(ComplianceService.name);

  constructor(
    @InjectRepository(ComplianceReport)
    private readonly reportRepo: Repository<ComplianceReport>,

    @InjectQueue(COMPLIANCE_REPORT_QUEUE)
    private readonly reportQueue: Queue<ComplianceReportJob>,

    private readonly storageService: ComplianceStorageService,
  ) {}

  // ---------------------------------------------------------------------------
  // GENERATE (queue)
  // ---------------------------------------------------------------------------

  async queueReport(
    dto: GenerateComplianceReportDto,
    user: RequestingUser,
  ): Promise<{
    reportId: string;
    status: string;
    estimatedRows: number;
    message: string;
  }> {
    this.validateDateRange(dto.reportType, dto.startDate, dto.endDate);

    const report = this.reportRepo.create({
      reportType: dto.reportType,
      format: dto.format,
      startDate: dto.startDate,
      endDate: dto.endDate,
      merchantId: dto.merchantId ?? null,
      notes: dto.notes ?? null,
      status: ComplianceReportStatus.QUEUED,
      requestedById: user.id,
      requestedByEmail: user.email,
    });

    await this.reportRepo.save(report);
    this.logger.log(`Compliance report queued: ${report.id} (${dto.reportType}) by ${user.email}`);

    const job: ComplianceReportJob = {
      reportId: report.id,
      reportType: dto.reportType,
      format: dto.format,
      startDate: dto.startDate,
      endDate: dto.endDate,
      merchantId: dto.merchantId,
      requestedById: user.id,
      requestedByEmail: user.email,
    };

    await this.reportQueue.add(COMPLIANCE_REPORT_JOB, job, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 50 },
    });

    const estimatedRows = await this.estimateRows(dto);

    return {
      reportId: report.id,
      status: ComplianceReportStatus.QUEUED,
      estimatedRows,
      message: 'Report queued. You will be notified by email when ready.',
    };
  }

  // ---------------------------------------------------------------------------
  // LIST
  // ---------------------------------------------------------------------------

  async listReports(query: PaginationQueryDto): Promise<{
    data: Partial<ComplianceReport>[];
    total: number;
    page: number;
    limit: number;
  }> {
    const { page = 1, limit = 20 } = query;

    const [reports, total] = await this.reportRepo.findAndCount({
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    const data = await Promise.all(
      reports.map(async (r) => this.toResponseShape(r)),
    );

    return { data, total, page, limit };
  }

  // ---------------------------------------------------------------------------
  // GET ONE
  // ---------------------------------------------------------------------------

  async getReport(id: string): Promise<Record<string, unknown>> {
    const report = await this.reportRepo.findOne({ where: { id } });
    if (!report) throw new NotFoundException(`Compliance report ${id} not found`);
    return this.toResponseShape(report);
  }

  // ---------------------------------------------------------------------------
  // INTERNAL — called by the processor after successful generation
  // ---------------------------------------------------------------------------

  async markCompleted(
    reportId: string,
    s3Key: string,
    rowCount: number,
    fileSizeBytes: number,
  ): Promise<void> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    await this.reportRepo.update(reportId, {
      status: ComplianceReportStatus.COMPLETED,
      s3Key,
      rowCount,
      fileSizeBytes,
      generatedAt: now,
      expiresAt,
    });
  }

  async markFailed(reportId: string, error: string): Promise<void> {
    await this.reportRepo.update(reportId, {
      status: ComplianceReportStatus.FAILED,
      errorMessage: error,
    });
  }

  // ---------------------------------------------------------------------------
  // PRIVATE HELPERS
  // ---------------------------------------------------------------------------

  private validateDateRange(
    reportType: ComplianceReportType,
    startDate: string,
    endDate: string,
  ): void {
    const start = new Date(startDate);
    const end = new Date(endDate);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new BadRequestException('Invalid date format');
    }

    if (end <= start) {
      throw new BadRequestException('endDate must be after startDate');
    }

    const diffDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    const maxDays = MAX_DATE_RANGE_DAYS[reportType];

    if (diffDays > maxDays) {
      throw new BadRequestException(
        `Date range for ${reportType} cannot exceed ${maxDays} days. Requested: ${diffDays} days.`,
      );
    }
  }

  private async estimateRows(dto: GenerateComplianceReportDto): Promise<number> {
    // Lightweight count query to give caller a useful estimate
    try {
      const qb = this.reportRepo.manager
        .createQueryBuilder()
        .select('COUNT(*)', 'count')
        .from('transactions', 't')
        .where('t.created_at >= :start', { start: dto.startDate })
        .andWhere('t.created_at < :end', { end: dto.endDate });

      if (dto.merchantId) {
        qb.andWhere('t.merchant_id = :merchantId', { merchantId: dto.merchantId });
      }

      const result = await qb.getRawOne();
      return parseInt(result?.count ?? '0', 10);
    } catch {
      // Non-fatal — return a safe fallback
      return 0;
    }
  }

  private async toResponseShape(report: ComplianceReport): Promise<Record<string, unknown>> {
    const base: Record<string, unknown> = {
      id: report.id,
      reportType: report.reportType,
      status: report.status,
      format: report.format,
      startDate: report.startDate,
      endDate: report.endDate,
      merchantId: report.merchantId,
      notes: report.notes,
      rowCount: report.rowCount,
      fileSizeBytes: report.fileSizeBytes,
      generatedAt: report.generatedAt,
      expiresAt: report.expiresAt,
      errorMessage: report.errorMessage,
      createdAt: report.createdAt,
      requestedBy: {
        id: report.requestedById,
        email: report.requestedByEmail,
      },
    };

    if (report.status === ComplianceReportStatus.COMPLETED && report.s3Key) {
      try {
        base['downloadUrl'] = await this.storageService.getPresignedDownloadUrl(report.s3Key);
      } catch (err) {
        this.logger.error(`Failed to generate pre-signed URL for ${report.id}`, err);
        base['downloadUrl'] = null;
      }
    }

    return base;
  }
}
