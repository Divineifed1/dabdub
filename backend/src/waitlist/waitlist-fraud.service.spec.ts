import { Test, TestingModule } from '@nestjs/testing';
import { Repository } from 'typeorm';
import Redis from 'ioredis';
import { WaitlistFraudService, WaitlistFraudException } from './waitlist-fraud.service';
import { WaitlistEntry } from './entities/waitlist-entry.entity';
import { WaitlistFraudLog, FraudAction } from './entities/waitlist-fraud-log.entity';
import { JoinWaitlistDto } from './dto/join-waitlist.dto';
import { DISPOSABLE_DOMAINS } from '../config/disposable-domains';

describe('WaitlistFraudService', () => {
  let service: WaitlistFraudService;
  let waitlistRepo: jest.Mocked<Repository<WaitlistEntry>>;
  let fraudLogRepo: jest.Mocked<Repository<WaitlistFraudLog>>;
  let redis: jest.Mocked<Redis>;

  const mockWaitlistEntry = {
    id: 1,
    email: 'test@example.com',
    referralCode: 'abc12345',
    ipAddress: '192.168.1.1',
    points: 100,
  } as WaitlistEntry;

  beforeEach(async () => {
    const mockRepo = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      createQueryBuilder: jest.fn(),
    } as any;

    const mockFraudRepo = {
      create: jest.fn(),
      save: jest.fn(),
      createQueryBuilder: jest.fn(),
    } as any;

    const mockRedis = {
      incr: jest.fn(),
      expire: jest.fn(),
      unlink: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WaitlistFraudService,
        {
          provide: 'WaitlistEntryRepository',
          useValue: mockRepo,
        },
        {
          provide: 'WaitlistFraudLogRepository',
          useValue: mockFraudRepo,
        },
        {
          provide: 'REDIS_CLIENT',
          useValue: mockRedis,
        },
      ],
    }).compile();

    service = module.get<WaitlistFraudService>(WaitlistFraudService);
    waitlistRepo = module.get('WaitlistEntryRepository');
    fraudLogRepo = module.get('WaitlistFraudLogRepository');
    redis = module.get('REDIS_CLIENT');
  });

  describe('check', () => {
    const validDto: JoinWaitlistDto = {
      email: 'test@example.com',
      name: 'Test User',
      referredByCode: 'ref123',
    };

    it('should pass all checks for valid request', async () => {
      redis.incr.mockResolvedValue(1);
      waitlistRepo.findOne.mockResolvedValue(null);

      await expect(service.check(validDto, '192.168.1.1', 'fingerprint123'))
        .resolves.not.toThrow();
    });

    it('should throw for disposable email', async () => {
      const disposableDto = {
        ...validDto,
        email: `test@${DISPOSABLE_DOMAINS[0]}`,
      };

      redis.incr.mockResolvedValue(1);
      fraudLogRepo.create.mockReturnValue({} as WaitlistFraudLog);
      fraudLogRepo.save.mockResolvedValue({} as WaitlistFraudLog);

      await expect(service.check(disposableDto, '192.168.1.1'))
        .rejects.toThrow(WaitlistFraudException);
    });

    it('should throw on 4th IP signup', async () => {
      redis.incr.mockResolvedValue(4);
      fraudLogRepo.create.mockReturnValue({} as WaitlistFraudLog);
      fraudLogRepo.save.mockResolvedValue({} as WaitlistFraudLog);

      await expect(service.check(validDto, '192.168.1.1'))
        .rejects.toThrow(WaitlistFraudException);
    });

    it('should flag but allow domain velocity > 20', async () => {
      redis.incr.mockResolvedValueOnce(1).mockResolvedValueOnce(21);
      fraudLogRepo.create.mockReturnValue({} as WaitlistFraudLog);
      fraudLogRepo.save.mockResolvedValue({} as WaitlistFraudLog);
      waitlistRepo.findOne.mockResolvedValue(null);

      await expect(service.check(validDto, '192.168.1.1'))
        .resolves.not.toThrow();
    });

    it('should flag but allow self-referral abuse', async () => {
      const selfReferralDto = {
        ...validDto,
        referredByCode: 'self123',
      };

      redis.incr.mockResolvedValue(1);
      waitlistRepo.findOne.mockResolvedValue(mockWaitlistEntry);
      fraudLogRepo.create.mockReturnValue({} as WaitlistFraudLog);
      fraudLogRepo.save.mockResolvedValue({} as WaitlistFraudLog);

      await expect(service.check(selfReferralDto, '192.168.1.1'))
        .resolves.not.toThrow();
    });

    it('should throw for duplicate email with rank', async () => {
      redis.incr.mockResolvedValue(1);
      waitlistRepo.findOne.mockResolvedValue(mockWaitlistEntry);
      waitlistRepo.createQueryBuilder.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(4), // rank 5
      } as any);
      fraudLogRepo.create.mockReturnValue({} as WaitlistFraudLog);
      fraudLogRepo.save.mockResolvedValue({} as WaitlistFraudLog);

      await expect(service.check(validDto, '192.168.1.1'))
        .rejects.toThrow(WaitlistFraudException);
    });
  });

  describe('getFraudLogs', () => {
    it('should return paginated fraud logs', async () => {
      const mockQueryBuilder = {
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      };

      fraudLogRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder as any);

      const result = await service.getFraudLogs(1, 20, 'IP_RATE_LIMIT', FraudAction.BLOCKED);

      expect(result).toEqual({ data: [], total: 0 });
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('log.rule = :rule', { rule: 'IP_RATE_LIMIT' });
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('log.action = :action', { action: FraudAction.BLOCKED });
    });
  });

  describe('resetIpRateLimit', () => {
    it('should reset IP rate limit and log action', async () => {
      redis.unlink.mockResolvedValue(1);
      fraudLogRepo.create.mockReturnValue({} as WaitlistFraudLog);
      fraudLogRepo.save.mockResolvedValue({} as WaitlistFraudLog);

      await service.resetIpRateLimit('192.168.1.1');

      expect(redis.unlink).toHaveBeenCalledWith('waitlist:ip:192.168.1.1');
      expect(fraudLogRepo.create).toHaveBeenCalledWith({
        email: 'system@reset',
        ip: '192.168.1.1',
        rule: 'IP_RATE_LIMIT_RESET',
        action: FraudAction.ALLOWED,
        details: { resetBy: 'admin' },
      });
    });
  });
});
