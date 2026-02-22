import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { ComplianceReport } from './entities/compliance-report.entity';
import { ComplianceController } from './controllers/compliance.controller';
import { ComplianceService } from './services/compliance.service';
import { ComplianceStorageService } from './services/compliance-storage.service';
import { ReportBuilderService } from './services/report-builder.service';
import { ComplianceEmailService } from './services/compliance-email.service';
import { ComplianceReportProcessor } from './processors/compliance-report.processor';
import { COMPLIANCE_REPORT_QUEUE } from './interfaces/compliance-report-job.interface';

@Module({
  imports: [
    TypeOrmModule.forFeature([ComplianceReport]),

    BullModule.registerQueue({
      name: COMPLIANCE_REPORT_QUEUE,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
      },
    }),
  ],
  controllers: [ComplianceController],
  providers: [
    ComplianceService,
    ComplianceStorageService,
    ReportBuilderService,
    ComplianceEmailService,
    ComplianceReportProcessor,
  ],
  exports: [ComplianceService],
})
export class ComplianceModule {}
