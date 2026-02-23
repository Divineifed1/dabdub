import { RedisService } from '@common/redis';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import Redis from 'ioredis';
import { AuditLogService } from 'src/audit/audit-log.service';
import {
  AuditAction,
  ActorType,
  DataClassification,
} from 'src/database/entities/audit-log.enums';
import { MerchantTier } from 'src/merchant';
import { Repository } from 'typeorm';
import {
  SetFlagOverrideDto,
  FlagEvaluationResponseDto,
  CreateFeatureFlagDto,
  UpdateFeatureFlagDto,
} from './dto/feature-flag.dto';
import { FeatureFlag } from './entities/feature-flag.entity';
import {
  RolloutStrategy,
  FeatureFlagEvaluationReason,
} from './enums/feature-flag.enums';
import { Merchant } from 'src/merchant/entities/merchant.entity';

const CACHE_TTL_SECONDS = 30;
const CACHE_KEY_PREFIX = 'feature_flags:';
const PUBSUB_CHANNEL = 'feature_flags:invalidate';

@Injectable()
export class FeatureFlagService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FeatureFlagService.name);
  private subscriber: Redis | null = null;

  constructor(
    @InjectRepository(FeatureFlag)
    private readonly flagRepo: Repository<FeatureFlag>,
    @InjectRepository(Merchant)
    private readonly merchantRepo: Repository<Merchant>,
    private readonly redisService: RedisService,
    private readonly auditService: AuditLogService,
  ) {}

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  async onModuleInit() {
    // Create a dedicated subscriber connection for pub/sub
    try {
      this.subscriber = this.redisService.client.duplicate();
      await this.subscriber.subscribe(PUBSUB_CHANNEL);
      this.subscriber.on('message', (_channel: string, flagKey: string) => {
        this.logger.debug(`Cache invalidation received for flag: ${flagKey}`);
        // invalidate the local cache entry if present (cache-manager handles Redis)
        void this.redisService.del(`${CACHE_KEY_PREFIX}${flagKey}`);
      });
      this.logger.log('Feature flag pub/sub subscriber connected');
    } catch (err) {
      this.logger.warn('Could not start feature-flag pub/sub subscriber', err);
    }
  }

  async onModuleDestroy() {
    if (this.subscriber) {
      await this.subscriber.quit();
    }
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private cacheKey(flagKey: string): string {
    return `${CACHE_KEY_PREFIX}${flagKey}`;
  }

  private async getOrFetch(flagKey: string): Promise<FeatureFlag> {
    const cached = await this.redisService.get<FeatureFlag>(
      this.cacheKey(flagKey),
    );
    if (cached) return cached;

    const flag = await this.flagRepo.findOne({ where: { flagKey } });
    if (!flag)
      throw new NotFoundException(`Feature flag '${flagKey}' not found`);

    await this.redisService.set(
      this.cacheKey(flagKey),
      flag,
      CACHE_TTL_SECONDS,
    );
    return flag;
  }

  private async invalidate(flagKey: string) {
    await this.redisService.del(this.cacheKey(flagKey));
    // Notify all service instances to invalidate their caches
    await this.redisService.client.publish(PUBSUB_CHANNEL, flagKey);
  }

  /**
   * Deterministic hash: hash(merchantId + flagKey) % 100 → 0–99.
   * A merchant is in the rollout cohort when their bucket < rolloutPercentage.
   */
  private merchantBucket(merchantId: string, flagKey: string): number {
    const hash = createHash('sha256')
      .update(`${merchantId}${flagKey}`)
      .digest('hex');
    // Take first 8 hex chars → 32-bit number
    return parseInt(hash.substring(0, 8), 16) % 100;
  }

  private estimateAffectedMerchants(flag: FeatureFlag, total: number): number {
    if (!flag.isEnabled) return 0;
    switch (flag.rolloutStrategy) {
      case RolloutStrategy.ALL:
        return total;
      case RolloutStrategy.PERCENTAGE:
        return Math.round(
          (parseFloat(flag.rolloutPercentage ?? '0') / 100) * total,
        );
      case RolloutStrategy.MERCHANT_IDS:
        return flag.targetMerchantIds?.length ?? 0;
      case RolloutStrategy.MERCHANT_TIERS:
      case RolloutStrategy.COUNTRIES:
        return -1; // unknown without a query
      default:
        return 0;
    }
  }

  // ─── CRUD ──────────────────────────────────────────────────────────────────

  async listFlags() {
    const [flags, total] = await this.flagRepo.findAndCount({
      where: { deletedAt: undefined },
      order: { createdAt: 'DESC' },
    });
    const merchantCount = await this.merchantRepo.count();
    return flags.map((f) => ({
      ...f,
      estimatedAffectedMerchants: this.estimateAffectedMerchants(
        f,
        merchantCount,
      ),
    }));
  }

  async getFlag(flagKey: string) {
    const flag = await this.getOrFetch(flagKey);
    const merchantCount = await this.merchantRepo.count();
    return {
      ...flag,
      estimatedAffectedMerchants: this.estimateAffectedMerchants(
        flag,
        merchantCount,
      ),
    };
  }

  async createFlag(dto: CreateFeatureFlagDto, actorId: string) {
    const existing = await this.flagRepo.findOne({
      where: { flagKey: dto.flagKey },
    });
    if (existing)
      throw new ConflictException(`Flag '${dto.flagKey}' already exists`);

    const flag = this.flagRepo.create({
      ...dto,
      rolloutPercentage:
        dto.rolloutPercentage != null ? String(dto.rolloutPercentage) : null,
      overriddenMerchantIds: [],
      overrides: {},
      lastChangedById: actorId,
    });

    const saved = await this.flagRepo.save(flag);
    await this.invalidate(dto.flagKey);

    await this.auditService.log({
      entityType: 'FeatureFlag',
      entityId: saved.id,
      action: AuditAction.CREATE,
      actorId,
      actorType: ActorType.ADMIN,
      afterState: saved as unknown as Record<string, unknown>,
      dataClassification: DataClassification.NORMAL,
    });

    return saved;
  }

  async updateFlag(
    flagKey: string,
    dto: UpdateFeatureFlagDto,
    actorId: string,
  ) {
    const flag = await this.flagRepo.findOne({ where: { flagKey } });
    if (!flag)
      throw new NotFoundException(`Feature flag '${flagKey}' not found`);

    const before = { ...flag };

    Object.assign(flag, {
      ...dto,
      rolloutPercentage:
        dto.rolloutPercentage != null
          ? String(dto.rolloutPercentage)
          : flag.rolloutPercentage,
      lastChangedById: actorId,
    });

    const saved = await this.flagRepo.save(flag);
    await this.invalidate(flagKey);

    await this.auditService.log({
      entityType: 'FeatureFlag',
      entityId: saved.id,
      action: AuditAction.UPDATE,
      actorId,
      actorType: ActorType.ADMIN,
      beforeState: before as unknown as Record<string, unknown>,
      afterState: saved as unknown as Record<string, unknown>,
      metadata: { flagKey },
      dataClassification: DataClassification.NORMAL,
    });

    return saved;
  }

  // ─── Overrides ─────────────────────────────────────────────────────────────

  async setOverride(flagKey: string, dto: SetFlagOverrideDto, actorId: string) {
    const flag = await this.flagRepo.findOne({ where: { flagKey } });
    if (!flag)
      throw new NotFoundException(`Feature flag '${flagKey}' not found`);

    // Verify merchant exists
    const merchant = await this.merchantRepo.findOne({
      where: { id: dto.merchantId },
    });
    if (!merchant)
      throw new NotFoundException(`Merchant '${dto.merchantId}' not found`);

    const before = {
      overrides: { ...flag.overrides },
      overriddenMerchantIds: [...flag.overriddenMerchantIds],
    };

    flag.overrides = { ...flag.overrides, [dto.merchantId]: dto.enabled };
    if (!flag.overriddenMerchantIds.includes(dto.merchantId)) {
      flag.overriddenMerchantIds = [
        ...flag.overriddenMerchantIds,
        dto.merchantId,
      ];
    }
    flag.lastChangedById = actorId;

    const saved = await this.flagRepo.save(flag);
    await this.invalidate(flagKey);

    await this.auditService.log({
      entityType: 'FeatureFlag',
      entityId: saved.id,
      action: AuditAction.UPDATE,
      actorId,
      actorType: ActorType.ADMIN,
      beforeState: before as Record<string, unknown>,
      afterState: {
        overrides: flag.overrides,
        overriddenMerchantIds: flag.overriddenMerchantIds,
      } as Record<string, unknown>,
      metadata: {
        flagKey,
        merchantId: dto.merchantId,
        enabled: dto.enabled,
        reason: dto.reason,
      },
      dataClassification: DataClassification.NORMAL,
    });

    return saved;
  }

  async removeOverride(flagKey: string, merchantId: string, actorId: string) {
    const flag = await this.flagRepo.findOne({ where: { flagKey } });
    if (!flag)
      throw new NotFoundException(`Feature flag '${flagKey}' not found`);

    if (!(merchantId in flag.overrides)) {
      throw new BadRequestException(
        `No override exists for merchant '${merchantId}' on flag '${flagKey}'`,
      );
    }

    const before = {
      overrides: { ...flag.overrides },
      overriddenMerchantIds: [...flag.overriddenMerchantIds],
    };

    const { [merchantId]: _removed, ...rest } = flag.overrides;
    flag.overrides = rest;
    flag.overriddenMerchantIds = flag.overriddenMerchantIds.filter(
      (id) => id !== merchantId,
    );
    flag.lastChangedById = actorId;

    const saved = await this.flagRepo.save(flag);
    await this.invalidate(flagKey);

    await this.auditService.log({
      entityType: 'FeatureFlag',
      entityId: saved.id,
      action: AuditAction.UPDATE,
      actorId,
      actorType: ActorType.ADMIN,
      beforeState: before as Record<string, unknown>,
      afterState: {
        overrides: flag.overrides,
        overriddenMerchantIds: flag.overriddenMerchantIds,
      } as Record<string, unknown>,
      metadata: { flagKey, merchantId, action: 'OVERRIDE_REMOVED' },
      dataClassification: DataClassification.NORMAL,
    });

    return {
      message: `Override removed for merchant ${merchantId} on flag ${flagKey}`,
    };
  }

  // ─── Evaluation ────────────────────────────────────────────────────────────

  async evaluateForMerchant(
    flagKey: string,
    merchantId: string,
  ): Promise<FlagEvaluationResponseDto> {
    const flag = await this.getOrFetch(flagKey);

    // 1. Global kill switch / disabled
    if (!flag.isEnabled) {
      return {
        flagKey,
        merchantId,
        isEnabled: false,
        reason: FeatureFlagEvaluationReason.DISABLED_GLOBALLY,
        detail: 'Flag is globally disabled',
      };
    }

    // 2. Per-merchant override takes highest precedence
    if (merchantId in flag.overrides) {
      const forced = flag.overrides[merchantId];
      return {
        flagKey,
        merchantId,
        isEnabled: forced,
        reason: forced
          ? FeatureFlagEvaluationReason.OVERRIDE_ON
          : FeatureFlagEvaluationReason.OVERRIDE_OFF,
        detail: `Merchant has an explicit override: ${forced ? 'ON' : 'OFF'}`,
      };
    }

    // 3. Rollout strategy evaluation
    switch (flag.rolloutStrategy) {
      case RolloutStrategy.ALL:
        return {
          flagKey,
          merchantId,
          isEnabled: true,
          reason: FeatureFlagEvaluationReason.ALL_ENABLED,
          detail: 'Flag is enabled for all merchants',
        };

      case RolloutStrategy.PERCENTAGE: {
        const pct = parseFloat(flag.rolloutPercentage ?? '0');
        const bucket = this.merchantBucket(merchantId, flagKey);
        const inCohort = bucket < pct;
        return {
          flagKey,
          merchantId,
          isEnabled: inCohort,
          reason: inCohort
            ? FeatureFlagEvaluationReason.PERCENTAGE_ROLLOUT
            : FeatureFlagEvaluationReason.PERCENTAGE_EXCLUDED,
          detail: inCohort
            ? `Merchant is in the ${pct}% rollout cohort (bucket ${bucket})`
            : `Merchant is outside the ${pct}% rollout cohort (bucket ${bucket})`,
        };
      }

      case RolloutStrategy.MERCHANT_IDS: {
        const match = flag.targetMerchantIds?.includes(merchantId) ?? false;
        return {
          flagKey,
          merchantId,
          isEnabled: match,
          reason: match
            ? FeatureFlagEvaluationReason.MERCHANT_IDS_MATCH
            : FeatureFlagEvaluationReason.MERCHANT_IDS_NO_MATCH,
          detail: match
            ? 'Merchant is in the target merchant IDs list'
            : 'Merchant is not in the target merchant IDs list',
        };
      }

      case RolloutStrategy.MERCHANT_TIERS: {
        const merchant = await this.merchantRepo.findOne({
          where: { id: merchantId },
        });
        const tier = merchant?.tier as MerchantTier | undefined;
        const match =
          tier != null && (flag.targetTiers?.includes(tier) ?? false);
        return {
          flagKey,
          merchantId,
          isEnabled: match,
          reason: match
            ? FeatureFlagEvaluationReason.MERCHANT_TIER_MATCH
            : FeatureFlagEvaluationReason.MERCHANT_TIER_NO_MATCH,
          detail: match
            ? `Merchant tier '${tier}' is in the target tiers`
            : `Merchant tier '${tier ?? 'unknown'}' is not in the target tiers`,
        };
      }

      case RolloutStrategy.COUNTRIES: {
        const merchant = await this.merchantRepo.findOne({
          where: { id: merchantId },
        });
        const country = (merchant as any)?.country as string | undefined;
        const match =
          country != null && (flag.targetCountries?.includes(country) ?? false);
        return {
          flagKey,
          merchantId,
          isEnabled: match,
          reason: match
            ? FeatureFlagEvaluationReason.COUNTRY_MATCH
            : FeatureFlagEvaluationReason.COUNTRY_NO_MATCH,
          detail: match
            ? `Merchant country '${country}' is in the target countries`
            : `Merchant country '${country ?? 'unknown'}' is not in the target countries`,
        };
      }

      default:
        return {
          flagKey,
          merchantId,
          isEnabled: false,
          reason: 'UNKNOWN_STRATEGY',
          detail: 'Unrecognised rollout strategy',
        };
    }
  }

  async evaluateAllForMerchant(merchantId: string) {
    const flags = await this.flagRepo.find({ where: { deletedAt: undefined } });
    const evaluations = await Promise.all(
      flags.map((f) => this.evaluateForMerchant(f.flagKey, merchantId)),
    );
    return { merchantId, evaluations };
  }
}
