import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Merchant } from '../merchants/entities/merchant.entity';
import {
  ComplianceEvent,
  ComplianceEventSeverity,
  ComplianceEventStatus,
  ComplianceEventType,
} from '../compliance/entities/compliance-event.entity';
import {
  FraudFlag,
  FraudSeverity,
  FraudStatus,
} from '../fraud/entities/fraud-flag.entity';
import { TierName } from '../tier-config/entities/tier-config.entity';
import { TierLimitExceededException } from '../common/exceptions/tier-limit-exceeded.exception';
import { User } from '../users/entities/user.entity';
import { Transfer, TransferStatus } from './entities/transfer.entity';

const NEW_RECIPIENT_CONFIRMATION_LIMIT = 50;
const P2P_DAILY_LIMITS: Record<TierName, number> = {
  [TierName.SILVER]: 30,
  [TierName.GOLD]: 300,
  [TierName.BLACK]: 2000,
};

@Injectable()
export class P2pLimitService {
  constructor(
    @InjectRepository(Transfer)
    private readonly transferRepo: Repository<Transfer>,

    @InjectRepository(User)
    private readonly userRepo: Repository<User>,

    @InjectRepository(Merchant)
    private readonly merchantRepo: Repository<Merchant>,

    @InjectRepository(ComplianceEvent)
    private readonly complianceEventRepo: Repository<ComplianceEvent>,

    @InjectRepository(FraudFlag)
    private readonly fraudFlagRepo: Repository<FraudFlag>,
  ) {}

  async checkNewRecipientLimit(
    userId: string,
    toUserId: string,
    amountUsdc: number,
  ): Promise<{ requiresConfirmation: boolean; reason?: string }> {
    if (amountUsdc <= NEW_RECIPIENT_CONFIRMATION_LIMIT) {
      return { requiresConfirmation: false };
    }

    if (!(await this.isP2pRecipient(toUserId))) {
      return { requiresConfirmation: false };
    }

    const existingCount = await this.transferRepo
      .createQueryBuilder('t')
      .where('t.from_user_id = :userId', { userId })
      .andWhere('t.to_user_id = :toUserId', { toUserId })
      .andWhere('t.status != :failedStatus', {
        failedStatus: TransferStatus.FAILED,
      })
      .getCount();

    if (existingCount > 0) {
      return { requiresConfirmation: false };
    }

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const duplicate = await this.complianceEventRepo
      .createQueryBuilder('ce')
      .where('ce.user_id = :userId', { userId })
      .andWhere('ce.event_type = :eventType', {
        eventType: ComplianceEventType.NEW_RECIPIENT_LARGE_TRANSFER,
      })
      .andWhere("ce.metadata ->> 'toUserId' = :toUserId", { toUserId })
      .andWhere('ce.createdAt >= :startOfDay', { startOfDay })
      .getOne();

    if (!duplicate) {
      await this.complianceEventRepo.save(
        this.complianceEventRepo.create({
          userId,
          eventType: ComplianceEventType.NEW_RECIPIENT_LARGE_TRANSFER,
          severity: ComplianceEventSeverity.LOW,
          status: ComplianceEventStatus.OPEN,
          txId: null,
          description:
            'First payment to a new recipient exceeds the confirmation threshold.',
          reviewedBy: null,
          resolvedBy: null,
          resolvedAt: null,
          metadata: {
            toUserId,
            amountUsdc: amountUsdc.toFixed(2),
          },
        }),
      );
    }

    return {
      requiresConfirmation: true,
      reason: 'First payment to this recipient',
    };
  }

  async checkVelocity(
    userId: string,
    pendingIncrement: number = 0,
  ): Promise<{ hourlyCount: number; isFlagged: boolean; isFrozen: boolean }> {
    const hourlyCount = (await this.getHourlyP2pCount(userId)) + pendingIncrement;
    const isFlagged = hourlyCount > 10;
    const isFrozen = hourlyCount > 20;

    if (isFlagged) {
      const existingFlag = await this.fraudFlagRepo.findOne({
        where: { userId, rule: 'velocity.p2p', status: FraudStatus.OPEN },
      });

      if (!existingFlag) {
        await this.fraudFlagRepo.save(
          this.fraudFlagRepo.create({
            userId,
            rule: 'velocity.p2p',
            severity: FraudSeverity.MEDIUM,
            description: `High P2P transfer velocity detected: ${hourlyCount} transfers in the last hour.`,
            triggeredBy: `p2p:${new Date().toISOString()}`,
            status: FraudStatus.OPEN,
            resolvedBy: null,
            resolvedAt: null,
            resolutionNote: null,
          }),
        );
      }
    }

    if (isFrozen) {
      const user = await this.userRepo.findOne({ where: { id: userId } });
      if (!user) {
        throw new NotFoundException('User not found');
      }

      if (user.isActive) {
        user.isActive = false;
        await this.userRepo.save(user);
      }
    }

    return { hourlyCount, isFlagged, isFrozen };
  }

  async getCumulativeP2pVolume(userId: string, hours: number): Promise<number> {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    const result = await this.baseP2pTransferQuery(userId)
      .andWhere('t.createdAt >= :since', { since })
      .select('COALESCE(SUM(CAST(t.amount AS NUMERIC)), 0)', 'sum')
      .getRawOne<{ sum: string }>();

    return parseFloat(result?.sum ?? '0');
  }

  async getDailyP2pRemaining(userId: string): Promise<{
    dailyP2pLimit: string;
    dailyP2pUsed: string;
    dailyP2pRemaining: string;
  }> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const dailyP2pLimit = P2P_DAILY_LIMITS[user.tier] ?? 0;
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const result = await this.baseP2pTransferQuery(userId)
      .andWhere('t.createdAt >= :startOfDay', { startOfDay })
      .select('COALESCE(SUM(CAST(t.amount AS NUMERIC)), 0)', 'sum')
      .getRawOne<{ sum: string }>();

    const dailyP2pUsed = parseFloat(result?.sum ?? '0');
    const dailyP2pRemaining = Math.max(0, dailyP2pLimit - dailyP2pUsed);

    return {
      dailyP2pLimit: dailyP2pLimit.toFixed(2),
      dailyP2pUsed: dailyP2pUsed.toFixed(2),
      dailyP2pRemaining: dailyP2pRemaining.toFixed(2),
    };
  }

  async getLimitsSummary(userId: string): Promise<{
    dailyP2pLimit: string;
    dailyP2pUsed: string;
    dailyP2pRemaining: string;
    hourlyCount: number;
    isFlagged: boolean;
  }> {
    const [daily, hourlyCount, openFlags] = await Promise.all([
      this.getDailyP2pRemaining(userId),
      this.getHourlyP2pCount(userId),
      this.fraudFlagRepo.count({
        where: { userId, rule: 'velocity.p2p', status: FraudStatus.OPEN },
      }),
    ]);

    return {
      ...daily,
      hourlyCount,
      isFlagged: openFlags > 0 || hourlyCount > 10,
    };
  }

  async assertTransferAllowed(
    userId: string,
    toUserId: string,
    amountUsdc: number,
  ): Promise<{
    isP2p: boolean;
    dailyP2pLimit: string;
    dailyP2pUsed: string;
    dailyP2pRemaining: string;
  }> {
    const limits = await this.getDailyP2pRemaining(userId);
    const isP2p = await this.isP2pRecipient(toUserId);

    if (!isP2p) {
      return { isP2p, ...limits };
    }

    if (amountUsdc > parseFloat(limits.dailyP2pRemaining)) {
      throw new TierLimitExceededException({
        limit: limits.dailyP2pLimit,
        used: limits.dailyP2pUsed,
        requested: amountUsdc.toFixed(2),
      });
    }

    return { isP2p, ...limits };
  }

  async getHourlyP2pCount(userId: string): Promise<number> {
    const since = new Date(Date.now() - 60 * 60 * 1000);
    return this.baseP2pTransferQuery(userId)
      .andWhere('t.createdAt >= :since', { since })
      .getCount();
  }

  async isP2pRecipient(toUserId: string): Promise<boolean> {
    const merchant = await this.merchantRepo.findOne({
      where: { userId: toUserId, isVerified: true },
    });
    return !merchant;
  }

  private baseP2pTransferQuery(userId: string) {
    return this.transferRepo
      .createQueryBuilder('t')
      .leftJoin(
        Merchant,
        'merchant',
        'merchant.user_id = t.to_user_id AND merchant.is_verified = true',
      )
      .where('t.from_user_id = :userId', { userId })
      .andWhere('merchant.user_id IS NULL')
      .andWhere('t.status != :failedStatus', {
        failedStatus: TransferStatus.FAILED,
      });
  }
}
