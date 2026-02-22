import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getQueueToken } from '@nestjs/bullmq';
import { BadRequestException } from '@nestjs/common';
import { ComplianceService } from '../src/compliance/services/compliance.service';
import { ComplianceStorageService } from '../src/compliance/services/compliance-storage.service';
import { ComplianceReport } from '../src/compliance/entities/compliance-report.entity';
import { COMPLIANCE_REPORT_QUEUE } from '../src/compliance/interfaces/compliance-report-job.interface';
import {
  ComplianceReportType,
  ReportFormat,
  ComplianceReportStatus,
} from '../src/compliance/enums/compliance-report.enum';

const mockRepo = {
  create: jest.fn(),
  save: jest.fn(),
  findOne: jest.fn(),
  findAndCount: jest.fn(),
  update: jest.fn(),
  manager: {
    createQueryBuilder: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({ count: '0' }),
    })),
  },
};

const mockQueue = { add: jest.fn() };

const mockStorage = {
  getPresignedDownloadUrl: jest.fn().mockResolvedValue('https://s3.example.com/presigned'),
};

describe('ComplianceService', () => {
  let service: ComplianceService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ComplianceService,
        { provide: getRepositoryToken(ComplianceReport), useValue: mockRepo },
        { provide: getQueueToken(COMPLIANCE_REPORT_QUEUE), useValue: mockQueue },
        { provide: ComplianceStorageService, useValue: mockStorage },
      ],
    }).compile();

    service = module.get<ComplianceService>(ComplianceService);
    jest.clearAllMocks();
  });

  const user = { id: 'user-uuid', email: 'compliance@cheese.io' };

  // -------------------------------------------------------------------------
  // Date range validation
  // -------------------------------------------------------------------------

  it('should reject TRANSACTION_REPORT spanning more than 365 days', async () => {
    await expect(
      service.queueReport(
        {
          reportType: ComplianceReportType.TRANSACTION_REPORT,
          startDate: '2025-01-01',
          endDate: '2026-02-01', // > 365 days
          format: ReportFormat.CSV,
        },
        user,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('should reject AML_SUMMARY spanning more than 90 days', async () => {
    await expect(
      service.queueReport(
        {
          reportType: ComplianceReportType.AML_SUMMARY,
          startDate: '2025-01-01',
          endDate: '2025-05-01', // > 90 days
          format: ReportFormat.CSV,
        },
        user,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('should reject when endDate is before startDate', async () => {
    await expect(
      service.queueReport(
        {
          reportType: ComplianceReportType.FEE_REPORT,
          startDate: '2026-02-01',
          endDate: '2026-01-01',
          format: ReportFormat.CSV,
        },
        user,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('should accept TRANSACTION_REPORT with exactly 365 days', async () => {
    mockRepo.create.mockReturnValue({ id: 'report-uuid', status: ComplianceReportStatus.QUEUED });
    mockRepo.save.mockResolvedValue({});

    const result = await service.queueReport(
      {
        reportType: ComplianceReportType.TRANSACTION_REPORT,
        startDate: '2025-01-01',
        endDate: '2025-12-31', // <= 365 days
        format: ReportFormat.CSV,
      },
      user,
    );

    expect(result.status).toBe(ComplianceReportStatus.QUEUED);
    expect(mockQueue.add).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // Queue job
  // -------------------------------------------------------------------------

  it('should enqueue a BullMQ job with correct payload', async () => {
    const report = { id: 'rpt-123', status: ComplianceReportStatus.QUEUED };
    mockRepo.create.mockReturnValue(report);
    mockRepo.save.mockResolvedValue(report);

    await service.queueReport(
      {
        reportType: ComplianceReportType.FEE_REPORT,
        startDate: '2026-01-01',
        endDate: '2026-01-31',
        format: ReportFormat.XLSX,
        merchantId: 'merchant-uuid',
      },
      user,
    );

    expect(mockQueue.add).toHaveBeenCalledWith(
      'generate-compliance-report',
      expect.objectContaining({
        reportId: 'rpt-123',
        reportType: ComplianceReportType.FEE_REPORT,
        format: ReportFormat.XLSX,
        merchantId: 'merchant-uuid',
        requestedByEmail: user.email,
      }),
      expect.objectContaining({ attempts: 3 }),
    );
  });

  // -------------------------------------------------------------------------
  // getReport
  // -------------------------------------------------------------------------

  it('should include presigned downloadUrl for COMPLETED reports', async () => {
    const report: Partial<ComplianceReport> = {
      id: 'rpt-completed',
      status: ComplianceReportStatus.COMPLETED,
      s3Key: 'compliance-reports/rpt-completed.csv',
      reportType: ComplianceReportType.TRANSACTION_REPORT,
      format: ReportFormat.CSV,
      startDate: '2026-01-01',
      endDate: '2026-01-31',
      rowCount: 1000,
      fileSizeBytes: 50000,
      generatedAt: new Date(),
      expiresAt: new Date(),
      requestedById: user.id,
      requestedByEmail: user.email,
    };

    mockRepo.findOne.mockResolvedValue(report);

    const result = await service.getReport('rpt-completed');

    expect(result['downloadUrl']).toBe('https://s3.example.com/presigned');
    expect(mockStorage.getPresignedDownloadUrl).toHaveBeenCalledWith(report.s3Key);
  });

  it('should NOT include downloadUrl for QUEUED reports', async () => {
    const report: Partial<ComplianceReport> = {
      id: 'rpt-queued',
      status: ComplianceReportStatus.QUEUED,
      s3Key: null,
      reportType: ComplianceReportType.AML_SUMMARY,
      format: ReportFormat.CSV,
      startDate: '2026-01-01',
      endDate: '2026-01-31',
      requestedById: user.id,
      requestedByEmail: user.email,
    };

    mockRepo.findOne.mockResolvedValue(report);
    const result = await service.getReport('rpt-queued');

    expect(result['downloadUrl']).toBeUndefined();
    expect(mockStorage.getPresignedDownloadUrl).not.toHaveBeenCalled();
  });
});
