import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PaymentRequestService } from './payment-request.service';
import { PaymentRequestRepository } from './repositories/payment-request.repository';
import { QrCodeService } from './services/qr-code.service';
import { StellarContractService } from './services/stellar-contract.service';
import { GlobalConfigService } from '../config/global-config.service';
import {
  PaymentRequest,
  PaymentRequestStatus,
  PaymentRequestType,
} from '../database/entities/payment-request.entity';
import { Merchant } from '../database/entities/merchant.entity';
import {
  PaymentRequestNotFoundException,
  PaymentRequestInvalidStatusException,
  PaymentRequestAmountTooLowException,
  PaymentRequestAmountTooHighException,
  PaymentRequestCannotCancelException,
} from './exceptions/payment-request.exceptions';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const MERCHANT_ID = 'merchant-uuid-001';
const STELLAR_CONFIG = {
  activeNetwork: 'testnet',
  networks: { testnet: { backendSecretKey: 'S_BACKEND' } },
  defaultExpirationMinutes: 30,
  minPaymentAmount: 0.1,
  maxPaymentAmount: 10_000,
};

function makeRequest(overrides: Partial<PaymentRequest> = {}): PaymentRequest {
  return {
    id: 'req-uuid-001',
    merchantId: MERCHANT_ID,
    amount: 100,
    currency: 'USDC',
    status: PaymentRequestStatus.PENDING,
    type: PaymentRequestType.PAYMENT,
    stellarNetwork: 'testnet',
    expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as PaymentRequest;
}

// ─── Mock factories ───────────────────────────────────────────────────────────

const mockRepo = {
  create: jest.fn(),
  findById: jest.fn(),
  findByIdempotencyKey: jest.fn(),
  update: jest.fn(),
  search: jest.fn(),
  getStats: jest.fn(),
  getStatsInRange: jest.fn(),
  findExpired: jest.fn(),
  updateBatchStatus: jest.fn(),
};

const mockQr = {
  generateQrCode: jest.fn().mockResolvedValue('data:image/png;base64,mock'),
  buildSep0007Uri: jest
    .fn()
    .mockReturnValue('web+stellar:pay?destination=G&amount=100'),
};

const mockContract = {
  createOnChainRequest: jest.fn().mockResolvedValue(null),
  markPaidOnChain: jest.fn().mockResolvedValue(null),
  cancelOnChain: jest.fn().mockResolvedValue(null),
  getWalletAddress: jest.fn().mockReturnValue('G_VAULT_ADDRESS'),
};

const mockConfig = {
  getStellarConfig: jest.fn().mockReturnValue(STELLAR_CONFIG),
};

const mockMerchantRepo = {
  findOne: jest.fn().mockResolvedValue({ id: MERCHANT_ID, settings: null }),
};

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('PaymentRequestService — E2E flows', () => {
  let service: PaymentRequestService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentRequestService,
        { provide: PaymentRequestRepository, useValue: mockRepo },
        { provide: QrCodeService, useValue: mockQr },
        { provide: StellarContractService, useValue: mockContract },
        { provide: GlobalConfigService, useValue: mockConfig },
        { provide: getRepositoryToken(Merchant), useValue: mockMerchantRepo },
      ],
    }).compile();

    service = module.get(PaymentRequestService);
  });

  // ── Create ──────────────────────────────────────────────────────────────

  describe('create()', () => {
    it('creates a valid payment request', async () => {
      const req = makeRequest();
      mockRepo.findByIdempotencyKey.mockResolvedValue(null);
      mockRepo.create.mockResolvedValue(req);

      const result = await service.create({
        merchantId: MERCHANT_ID,
        amount: 100,
        currency: 'USDC',
        stellarNetwork: 'testnet',
      } as any);

      expect(result.id).toBe('req-uuid-001');
      expect(mockRepo.create).toHaveBeenCalledTimes(1);
    });

    it('returns existing request for duplicate idempotency key', async () => {
      const existing = makeRequest({ id: 'existing-001' });
      mockRepo.findByIdempotencyKey.mockResolvedValue(existing);

      const result = await service.create({
        merchantId: MERCHANT_ID,
        amount: 100,
        currency: 'USDC',
        idempotencyKey: 'idem-key-001',
      } as any);

      expect(result.id).toBe('existing-001');
      expect(mockRepo.create).not.toHaveBeenCalled();
    });

    it('throws PaymentRequestAmountTooLowException for amount below minimum', async () => {
      mockRepo.findByIdempotencyKey.mockResolvedValue(null);

      await expect(
        service.create({
          merchantId: MERCHANT_ID,
          amount: 0.05, // below 0.1 minimum
          currency: 'USDC',
        } as any),
      ).rejects.toThrow(PaymentRequestAmountTooLowException);
    });

    it('throws PaymentRequestAmountTooHighException for amount above maximum', async () => {
      mockRepo.findByIdempotencyKey.mockResolvedValue(null);

      await expect(
        service.create({
          merchantId: MERCHANT_ID,
          amount: 20_000, // above 10_000 maximum
          currency: 'USDC',
        } as any),
      ).rejects.toThrow(PaymentRequestAmountTooHighException);
    });

    it('rejects zero amount', async () => {
      mockRepo.findByIdempotencyKey.mockResolvedValue(null);

      await expect(
        service.create({
          merchantId: MERCHANT_ID,
          amount: 0,
          currency: 'USDC',
        } as any),
      ).rejects.toThrow(PaymentRequestAmountTooLowException);
    });
  });

  // ── Status transitions ──────────────────────────────────────────────────

  describe('updateStatus()', () => {
    it('PENDING → PROCESSING is allowed', async () => {
      const req = makeRequest({ status: PaymentRequestStatus.PENDING });
      mockRepo.findById.mockResolvedValue(req);
      mockRepo.update.mockResolvedValue({
        ...req,
        status: PaymentRequestStatus.PROCESSING,
      });

      const result = await service.updateStatus(
        'req-uuid-001',
        PaymentRequestStatus.PROCESSING,
      );

      expect(result.status).toBe(PaymentRequestStatus.PROCESSING);
    });

    it('PROCESSING → COMPLETED is allowed', async () => {
      const req = makeRequest({ status: PaymentRequestStatus.PROCESSING });
      mockRepo.findById.mockResolvedValue(req);
      mockRepo.update.mockResolvedValue({
        ...req,
        status: PaymentRequestStatus.COMPLETED,
      });

      const result = await service.updateStatus(
        'req-uuid-001',
        PaymentRequestStatus.COMPLETED,
      );
      expect(result.status).toBe(PaymentRequestStatus.COMPLETED);
    });

    it('COMPLETED → REFUNDED is allowed', async () => {
      const req = makeRequest({ status: PaymentRequestStatus.COMPLETED });
      mockRepo.findById.mockResolvedValue(req);
      mockRepo.update.mockResolvedValue({
        ...req,
        status: PaymentRequestStatus.REFUNDED,
      });

      const result = await service.updateStatus(
        'req-uuid-001',
        PaymentRequestStatus.REFUNDED,
      );
      expect(result.status).toBe(PaymentRequestStatus.REFUNDED);
    });

    it('COMPLETED → PENDING is invalid transition', async () => {
      const req = makeRequest({ status: PaymentRequestStatus.COMPLETED });
      mockRepo.findById.mockResolvedValue(req);

      await expect(
        service.updateStatus('req-uuid-001', PaymentRequestStatus.PENDING),
      ).rejects.toThrow(PaymentRequestInvalidStatusException);
    });

    it('CANCELLED → COMPLETED is invalid transition', async () => {
      const req = makeRequest({ status: PaymentRequestStatus.CANCELLED });
      mockRepo.findById.mockResolvedValue(req);

      await expect(
        service.updateStatus('req-uuid-001', PaymentRequestStatus.COMPLETED),
      ).rejects.toThrow(PaymentRequestInvalidStatusException);
    });

    it('throws NotFoundException for unknown request ID', async () => {
      mockRepo.findById.mockResolvedValue(null);

      await expect(
        service.updateStatus('non-existent', PaymentRequestStatus.PROCESSING),
      ).rejects.toThrow(PaymentRequestNotFoundException);
    });
  });

  // ── Cancel ──────────────────────────────────────────────────────────────

  describe('cancel()', () => {
    it('cancels a PENDING request', async () => {
      const req = makeRequest({ status: PaymentRequestStatus.PENDING });
      mockRepo.findById.mockResolvedValue(req);
      mockRepo.update.mockResolvedValue({
        ...req,
        status: PaymentRequestStatus.CANCELLED,
      });

      const result = await service.cancel('req-uuid-001', MERCHANT_ID);
      expect(result.status).toBe(PaymentRequestStatus.CANCELLED);
      expect(mockContract.cancelOnChain).toHaveBeenCalled();
    });

    it('cannot cancel a COMPLETED request', async () => {
      const req = makeRequest({ status: PaymentRequestStatus.COMPLETED });
      mockRepo.findById.mockResolvedValue(req);

      await expect(service.cancel('req-uuid-001', MERCHANT_ID)).rejects.toThrow(
        PaymentRequestCannotCancelException,
      );
    });

    it("cannot cancel another merchant's request", async () => {
      const req = makeRequest({ merchantId: 'different-merchant-id' });
      mockRepo.findById.mockResolvedValue(req);

      await expect(
        service.cancel('req-uuid-001', MERCHANT_ID),
      ).rejects.toThrow();
    });
  });

  // ── Expired batch ───────────────────────────────────────────────────────

  describe('expiration handling', () => {
    it('marks expired requests in batch', async () => {
      const expired = [
        makeRequest({ id: 'exp-1' }),
        makeRequest({ id: 'exp-2' }),
      ];
      mockRepo.findExpired.mockResolvedValue(expired);
      mockRepo.updateBatchStatus.mockResolvedValue(undefined);

      await service.expireOutdatedRequests();

      expect(mockRepo.updateBatchStatus).toHaveBeenCalledWith(
        ['exp-1', 'exp-2'],
        PaymentRequestStatus.EXPIRED,
      );
    });

    it('does nothing when no requests are expired', async () => {
      mockRepo.findExpired.mockResolvedValue([]);

      await service.expireOutdatedRequests();

      expect(mockRepo.updateBatchStatus).not.toHaveBeenCalled();
    });
  });
});

// ─── Security tests ───────────────────────────────────────────────────────────

describe('PaymentRequestService — Security', () => {
  let service: PaymentRequestService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentRequestService,
        { provide: PaymentRequestRepository, useValue: mockRepo },
        { provide: QrCodeService, useValue: mockQr },
        { provide: StellarContractService, useValue: mockContract },
        { provide: GlobalConfigService, useValue: mockConfig },
        { provide: getRepositoryToken(Merchant), useValue: mockMerchantRepo },
      ],
    }).compile();
    service = module.get(PaymentRequestService);
  });

  it('SEC-PR-01: merchant cannot cancel request belonging to another merchant', async () => {
    const req = makeRequest({ merchantId: 'other-merchant' });
    mockRepo.findById.mockResolvedValue(req);

    await expect(service.cancel(req.id, MERCHANT_ID)).rejects.toThrow();
  });

  it('SEC-PR-02: request not found returns 404 not 500', async () => {
    mockRepo.findById.mockResolvedValue(null);

    await expect(service.findById('bogus-id')).rejects.toThrow(
      PaymentRequestNotFoundException,
    );
  });

  it('SEC-PR-03: amount validation cannot be bypassed via merchant settings override', async () => {
    // Even if merchant has no custom limits, global limits apply
    mockMerchantRepo.findOne.mockResolvedValue({
      id: MERCHANT_ID,
      settings: { maxPaymentAmount: 999_999 },
    });
    mockRepo.findByIdempotencyKey.mockResolvedValue(null);

    // Should still respect global max (10_000 from STELLAR_CONFIG)
    await expect(
      service.create({
        merchantId: MERCHANT_ID,
        amount: 50_000,
        currency: 'USDC',
      } as any),
    ).rejects.toThrow(PaymentRequestAmountTooHighException);
  });
});
