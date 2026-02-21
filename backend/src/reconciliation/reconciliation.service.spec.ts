import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ReconciliationService } from './reconciliation.service';
import { Reconciliation, ReconciliationStatus } from './reconciliation.entity';
import { Transaction, TransactionStatus } from '../transactions/entities/transaction.entity';
import { Settlement, SettlementStatus } from '../settlement/entities/settlement.entity';

describe('ReconciliationService', () => {
  let service: ReconciliationService;

  const mockReconciliationRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockTransactionRepo = {
    find: jest.fn(),
  };

  const mockSettlementRepo = {
    find: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReconciliationService,
        { provide: getRepositoryToken(Reconciliation), useValue: mockReconciliationRepo },
        { provide: getRepositoryToken(Transaction), useValue: mockTransactionRepo },
        { provide: getRepositoryToken(Settlement), useValue: mockSettlementRepo },
      ],
    }).compile();

    service = module.get<ReconciliationService>(ReconciliationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getReport', () => {
    it('should return reconciliation report', async () => {
      mockReconciliationRepo.count
        .mockResolvedValueOnce(100)
        .mockResolvedValueOnce(95)
        .mockResolvedValueOnce(3)
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(1);

      const report = await service.getReport();

      expect(report.total).toBe(100);
      expect(report.matched).toBe(95);
      expect(report.autoReconcileRate).toBe('95.00%');
    });
  });

  describe('manualResolve', () => {
    it('should manually resolve a discrepancy', async () => {
      const mockRecord = {
        id: 'rec-1',
        status: ReconciliationStatus.DISCREPANCY,
      };

      mockReconciliationRepo.findOne.mockResolvedValue(mockRecord);
      mockReconciliationRepo.save.mockResolvedValue({
        ...mockRecord,
        status: ReconciliationStatus.MANUALLY_RESOLVED,
        resolvedBy: 'admin',
      });

      const result = await service.manualResolve('rec-1', 'admin', 'Resolved manually');

      expect(result.status).toBe(ReconciliationStatus.MANUALLY_RESOLVED);
      expect(result.resolvedBy).toBe('admin');
    });
  });
});
