import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../common/entities/base.entity';

export enum OnRampStatus {
  PENDING = 'pending',
  PAID = 'paid',
  CREDITED = 'credited',
  EXPIRED = 'expired',
  FAILED = 'failed',
}

@Entity('onramp_orders')
@Index(['reference'], { unique: true })
@Index(['userId', 'createdAt'])
@Index(['status', 'expiresAt'])
export class OnRampOrder extends BaseEntity {
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ length: 64 })
  reference!: string;

  @Column({ name: 'amount_ngn', type: 'numeric', precision: 18, scale: 2 })
  amountNgn!: string;

  @Column({ name: 'fee_ngn', type: 'numeric', precision: 18, scale: 2 })
  feeNgn!: string;

  @Column({ name: 'net_ngn', type: 'numeric', precision: 18, scale: 2 })
  netNgn!: string;

  @Column({ name: 'amount_usdc', type: 'numeric', precision: 18, scale: 6 })
  amountUsdc!: string;

  @Column({
    name: 'rate_ngn_per_usdc',
    type: 'numeric',
    precision: 18,
    scale: 6,
  })
  rateNgnPerUsdc!: string;

  @Column({ name: 'spread_percent', type: 'numeric', precision: 8, scale: 4 })
  spreadPercent!: string;

  @Column({
    type: 'enum',
    enum: OnRampStatus,
    default: OnRampStatus.PENDING,
  })
  status!: OnRampStatus;

  @Column({ name: 'virtual_account_number', length: 32, nullable: true })
  virtualAccountNumber!: string | null;

  @Column({ name: 'virtual_account_bank_name', length: 128, nullable: true })
  virtualAccountBankName!: string | null;

  @Column({ name: 'virtual_account_name', length: 128, nullable: true })
  virtualAccountName!: string | null;

  @Column({ name: 'flutterwave_reference', length: 128, nullable: true })
  flutterwaveReference!: string | null;

  @Column({ name: 'settlement_reference', length: 128, nullable: true })
  settlementReference!: string | null;

  @Column({ name: 'failure_reason', type: 'text', nullable: true })
  failureReason!: string | null;

  @Column({ name: 'webhook_payload', type: 'jsonb', nullable: true })
  webhookPayload!: Record<string, unknown> | null;

  @Column({ name: 'paid_at', type: 'timestamptz', nullable: true })
  paidAt!: Date | null;

  @Column({ name: 'credited_at', type: 'timestamptz', nullable: true })
  creditedAt!: Date | null;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;
}
