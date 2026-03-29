import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { FeeConfig, FeeType } from '../fee-config/entities/fee-config.entity';
import { User } from '../users/entities/user.entity';
import { FlutterwaveClient } from './flutterwave.client';
import { OnRampOrder, OnRampStatus } from './onramp-order.entity';
import { OnRampService } from './onramp.service';

const mockOrderRepo = {
  create: jest.fn((value: Partial<OnRampOrder>) => value),
  save: jest.fn((value: Partial<OnRampOrder>) => Promise.resolve(value)),
  findOne: jest.fn(),
  findAndCount: jest.fn(),
  find: jest.fn(),
};

const mockFeeRepo = {
  findOne: jest.fn(),
};

const mockUserRepo = {
  findOne: jest.fn(),
};

const mockConfigService = {
  get: jest.fn((key: string) => {
    const values: Record<string, string> = {
      ONRAMP_NGN_USDC_RATE: '1600',
      ONRAMP_SPREAD_PERCENT: '1.5',
      ONRAMP_PAYMENT_DEADLINE_MINUTES: '30',
      ONRAMP_AMOUNT_TOLERANCE_NGN: '1',
    };

    return values[key];
  }),
};

const mockFlutterwaveClient = {
  createVirtualAccount: jest.fn(),
};

describe('OnRampService', () => {
  let service: OnRampService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OnRampService,
        {
          provide: getRepositoryToken(OnRampOrder),
          useValue: mockOrderRepo,
        },
        {
          provide: getRepositoryToken(FeeConfig),
          useValue: mockFeeRepo,
        },
        {
          provide: getRepositoryToken(User),
          useValue: mockUserRepo,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: FlutterwaveClient,
          useValue: mockFlutterwaveClient,
        },
      ],
    }).compile();

    service = module.get<OnRampService>(OnRampService);
    mockFeeRepo.findOne.mockResolvedValue({
      feeType: FeeType.DEPOSIT,
      baseFeeRate: '0.000000',
      minFee: '0',
      maxFee: null,
      isActive: true,
    } satisfies Partial<FeeConfig>);
  });

  describe('preview', () => {
    it('computes the quoted USDC amount with spread applied', async () => {
      const result = await service.preview('user-1', 10_000);

      expect(result.feeNgn).toBe(0);
      expect(result.netNgn).toBe(10_000);
      expect(result.rateNgnPerUsdc).toBe(1600);
      expect(result.spreadPercent).toBe(1.5);
      expect(result.amountUsdc).toBeCloseTo(10_000 / 1624, 6);
    });

    it('applies the configured minimum deposit fee', async () => {
      mockFeeRepo.findOne.mockResolvedValue({
        feeType: FeeType.DEPOSIT,
        baseFeeRate: '0.010000',
        minFee: '100',
        maxFee: null,
        isActive: true,
      } satisfies Partial<FeeConfig>);

      const result = await service.preview('user-1', 10_000);

      expect(result.feeNgn).toBe(100);
      expect(result.netNgn).toBe(9900);
    });

    it('throws when fees consume the full amount', async () => {
      mockFeeRepo.findOne.mockResolvedValue({
        feeType: FeeType.DEPOSIT,
        baseFeeRate: '0.000000',
        minFee: '100',
        maxFee: null,
        isActive: true,
      } satisfies Partial<FeeConfig>);

      await expect(service.preview('user-1', 100)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('initiate', () => {
    it('creates an order and returns the virtual account details', async () => {
      mockUserRepo.findOne.mockResolvedValue({
        id: 'user-1',
        email: 'alice@example.com',
        username: 'alice',
        displayName: 'Alice',
      } satisfies Partial<User>);
      mockFlutterwaveClient.createVirtualAccount.mockResolvedValue({
        accountNumber: '0123456789',
        bankName: 'Test Bank',
        accountName: 'Alice',
        flutterwaveReference: 'flw-1',
        expiresAt: new Date('2026-01-01T00:30:00.000Z'),
      });

      const result = await service.initiate('user-1', 10_000);

      expect(result.reference).toMatch(/^ONRAMP-[A-Z0-9]{16}$/);
      expect(result.accountNumber).toBe('0123456789');
      expect(mockOrderRepo.save).toHaveBeenCalled();
    });

    it('throws when the user does not exist', async () => {
      mockUserRepo.findOne.mockResolvedValue(null);

      await expect(service.initiate('missing-user', 10_000)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('handleWebhook', () => {
    const baseOrder: OnRampOrder = {
      id: 'order-1',
      createdAt: new Date(),
      updatedAt: new Date(),
      userId: 'user-1',
      reference: 'ONRAMP-ABCDEF1234567890',
      amountNgn: '10000.00',
      feeNgn: '0.00',
      netNgn: '10000.00',
      amountUsdc: '6.157635',
      rateNgnPerUsdc: '1600.000000',
      spreadPercent: '1.5000',
      status: OnRampStatus.PENDING,
      virtualAccountNumber: '0123456789',
      virtualAccountBankName: 'Test Bank',
      virtualAccountName: 'Alice',
      flutterwaveReference: null,
      settlementReference: null,
      failureReason: null,
      webhookPayload: null,
      paidAt: null,
      creditedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    };

    const makePayload = (amount: number) => ({
      data: {
        tx_ref: baseOrder.reference,
        amount,
        id: 'flw-id-1',
      },
    });

    it('credits an exact amount and marks the order credited', async () => {
      mockOrderRepo.findOne.mockResolvedValue({ ...baseOrder });

      await service.handleWebhook(makePayload(10_000));

      expect(mockOrderRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: OnRampStatus.CREDITED,
          settlementReference: `credit-${baseOrder.reference}`,
        }),
      );
    });

    it('accepts payments within the configured tolerance', async () => {
      mockOrderRepo.findOne.mockResolvedValue({ ...baseOrder });

      await service.handleWebhook(makePayload(9_999));

      expect(mockOrderRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: OnRampStatus.CREDITED }),
      );
    });

    it('fails payments outside the tolerance', async () => {
      mockOrderRepo.findOne.mockResolvedValue({ ...baseOrder });

      await service.handleWebhook(makePayload(9_500));

      const failedSave = mockOrderRepo.save.mock.calls.at(-1)?.[0];

      expect(failedSave?.status).toBe(OnRampStatus.FAILED);
      expect(failedSave?.failureReason).toContain('Amount mismatch');
    });

    it('marks late payments as expired', async () => {
      mockOrderRepo.findOne.mockResolvedValue({
        ...baseOrder,
        expiresAt: new Date(Date.now() - 60_000),
      });

      await service.handleWebhook(makePayload(10_000));

      expect(mockOrderRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: OnRampStatus.EXPIRED,
        }),
      );
    });

    it('ignores already credited orders', async () => {
      mockOrderRepo.findOne.mockResolvedValue({
        ...baseOrder,
        status: OnRampStatus.CREDITED,
      });

      await service.handleWebhook(makePayload(10_000));

      expect(mockOrderRepo.save).not.toHaveBeenCalled();
    });

    it('ignores payloads without a matching reference', async () => {
      await service.handleWebhook({ data: { amount: 10_000 } });

      expect(mockOrderRepo.findOne).not.toHaveBeenCalled();
    });
  });

  describe('expireStaleOrders', () => {
    it('expires pending orders whose deadline has passed', async () => {
      mockOrderRepo.find.mockResolvedValue([
        {
          id: 'order-1',
          status: OnRampStatus.PENDING,
          failureReason: null,
        },
      ]);

      const count = await service.expireStaleOrders();

      expect(count).toBe(1);
      expect(mockOrderRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: OnRampStatus.EXPIRED,
          failureReason: 'Payment window expired',
        }),
      );
    });

    it('returns zero when there are no stale orders', async () => {
      mockOrderRepo.find.mockResolvedValue([]);

      await expect(service.expireStaleOrders()).resolves.toBe(0);
    });
  });

  describe('getOrderById', () => {
    it('throws when the order does not exist for the user', async () => {
      mockOrderRepo.findOne.mockResolvedValue(null);

      await expect(
        service.getOrderById('user-1', '5e608584-2067-403f-a6b9-ed76fd250ee1'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
