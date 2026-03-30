import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { P2pLimitService } from './p2p-limit.service';
import { Transfer } from './entities/transfer.entity';
import { User } from '../users/entities/user.entity';
import { Merchant } from '../merchants/entities/merchant.entity';
import { ComplianceEvent } from '../compliance/entities/compliance-event.entity';
import { FraudFlag } from '../fraud/entities/fraud-flag.entity';
import { TierName } from '../tier-config/entities/tier-config.entity';
import { TierLimitExceededException } from '../common/exceptions/tier-limit-exceeded.exception';

const transferRepo = {
  createQueryBuilder: jest.fn(),
};

const userRepo = {
  findOne: jest.fn(),
  save: jest.fn(),
};

const merchantRepo = {
  findOne: jest.fn(),
};

const complianceEventRepo = {
  createQueryBuilder: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
};

const fraudFlagRepo = {
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  count: jest.fn(),
};

function mockTransferQuery({
  count = 0,
  sum = '0',
}: {
  count?: number;
  sum?: string;
}) {
  const qb = {
    leftJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    getCount: jest.fn().mockResolvedValue(count),
    getRawOne: jest.fn().mockResolvedValue({ sum }),
  };
  transferRepo.createQueryBuilder.mockReturnValue(qb);
  return qb;
}

function mockComplianceDuplicate(result: ComplianceEvent | null = null) {
  const qb = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getOne: jest.fn().mockResolvedValue(result),
  };
  complianceEventRepo.createQueryBuilder.mockReturnValue(qb);
  return qb;
}

describe('P2pLimitService', () => {
  let service: P2pLimitService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        P2pLimitService,
        { provide: getRepositoryToken(Transfer), useValue: transferRepo },
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: getRepositoryToken(Merchant), useValue: merchantRepo },
        {
          provide: getRepositoryToken(ComplianceEvent),
          useValue: complianceEventRepo,
        },
        { provide: getRepositoryToken(FraudFlag), useValue: fraudFlagRepo },
      ],
    }).compile();

    service = module.get(P2pLimitService);
  });

  it('new recipient large transfer returns requiresConfirmation', async () => {
    merchantRepo.findOne.mockResolvedValue(null);
    mockTransferQuery({ count: 0 });
    mockComplianceDuplicate(null);
    complianceEventRepo.create.mockImplementation((value) => value);
    complianceEventRepo.save.mockResolvedValue(undefined);

    const result = await service.checkNewRecipientLimit('user-1', 'user-2', 51);

    expect(result).toEqual({
      requiresConfirmation: true,
      reason: 'First payment to this recipient',
    });
    expect(complianceEventRepo.save).toHaveBeenCalled();
  });

  it('21 transfers in 1h auto-freezes the user', async () => {
    mockTransferQuery({ count: 20 });
    fraudFlagRepo.findOne.mockResolvedValue(null);
    fraudFlagRepo.create.mockImplementation((value) => value);
    fraudFlagRepo.save.mockResolvedValue(undefined);
    userRepo.findOne.mockResolvedValue({
      id: 'user-1',
      isActive: true,
      tier: TierName.SILVER,
    });
    userRepo.save.mockResolvedValue(undefined);

    const result = await service.checkVelocity('user-1', 1);

    expect(result.isFrozen).toBe(true);
    expect(userRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ isActive: false }),
    );
  });

  it('merchant payment is excluded from the P2P limit', async () => {
    userRepo.findOne.mockResolvedValue({ id: 'user-1', tier: TierName.SILVER });
    merchantRepo.findOne.mockResolvedValue({
      userId: 'merchant-1',
      isVerified: true,
    });
    mockTransferQuery({ sum: '29' });

    await expect(
      service.assertTransferAllowed('user-1', 'merchant-1', 25),
    ).resolves.toEqual(
      expect.objectContaining({
        isP2p: false,
        dailyP2pLimit: '30.00',
      }),
    );
  });

  it('Silver $30 P2P sub-limit is enforced independently of the wider tier limit', async () => {
    userRepo.findOne.mockResolvedValue({ id: 'user-1', tier: TierName.SILVER });
    merchantRepo.findOne.mockResolvedValue(null);
    mockTransferQuery({ sum: '20' });

    await expect(
      service.assertTransferAllowed('user-1', 'user-2', 15),
    ).rejects.toThrow(TierLimitExceededException);
  });
});
