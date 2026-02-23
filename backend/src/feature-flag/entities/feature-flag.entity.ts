import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../database/entities/base.entity';
import { MerchantTier } from '../../merchant/dto/merchant.dto';
import { RolloutStrategy } from '../enums/feature-flag.enums';

@Entity('feature_flags')
@Index(['flagKey'], { unique: true })
export class FeatureFlag extends BaseEntity {
  @Column({ unique: true })
  flagKey: string; // e.g. 'enable_starknet_chain', 'new_settlement_engine'

  @Column()
  displayName: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'boolean', default: false })
  isEnabled: boolean;

  @Column({ type: 'enum', enum: RolloutStrategy, default: RolloutStrategy.ALL })
  rolloutStrategy: RolloutStrategy;

  @Column({
    type: 'decimal',
    precision: 5,
    scale: 2,
    nullable: true,
  })
  rolloutPercentage: string | null; // 0.00 – 100.00 for PERCENTAGE strategy

  @Column({ type: 'jsonb', nullable: true })
  targetMerchantIds: string[] | null;

  @Column({ type: 'jsonb', nullable: true })
  targetTiers: MerchantTier[] | null;

  @Column({ type: 'jsonb', nullable: true })
  targetCountries: string[] | null;

  /** Merchant IDs that have an explicit override (ON or OFF). */
  @Column({ type: 'jsonb', default: [] })
  overriddenMerchantIds: string[];

  /** Map of merchantId → forced boolean. */
  @Column({ type: 'jsonb', default: {} })
  overrides: Record<string, boolean>;

  /** Emergency kill switch — only SUPER_ADMIN may toggle. */
  @Column({ type: 'boolean', default: false })
  isKillSwitch: boolean;

  @Column({ nullable: true })
  lastChangedById: string | null;
}
