import { Entity, Column } from 'typeorm';
import { BaseEntity } from '../../database/entities/base.entity';
import { WithdrawalStatus } from '../enums/withdrawal-status.enum';

@Entity('treasury_withdrawals')
export class TreasuryWithdrawal extends BaseEntity {
  @Column()
  chain: string;

  @Column()
  fromAddress: string;

  @Column()
  toAddress: string;

  @Column({ type: 'decimal', precision: 30, scale: 18 })
  tokenAmount: string;

  @Column()
  tokenSymbol: string;

  @Column({ type: 'decimal', precision: 20, scale: 8 })
  usdValueAtTime: string;

  @Column({ type: 'enum', enum: WithdrawalStatus })
  status: WithdrawalStatus;

  @Column({ type: 'text' })
  reason: string;

  @Column()
  requestedById: string;

  @Column({ nullable: true })
  approvedById: string | null;

  @Column({ nullable: true })
  rejectedById: string | null;

  @Column({ type: 'text', nullable: true })
  rejectionReason: string | null;

  @Column({ nullable: true })
  txHash: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  approvedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @Column({ type: 'jsonb', default: [] })
  approvedWhitelistAddresses: string[];
}
