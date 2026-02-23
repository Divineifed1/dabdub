import { Entity, Column } from 'typeorm';
import { BaseEntity } from '../../database/entities/base.entity';

@Entity('platform_wallets')
export class PlatformWallet extends BaseEntity {
  @Column({ unique: true })
  chain: string;

  @Column()
  walletAddress: string;

  @Column({ type: 'decimal', precision: 30, scale: 18, default: 0 })
  totalFeesCollectedAllTime: string;

  @Column({ type: 'decimal', precision: 30, scale: 18, default: 0 })
  totalWithdrawnAllTime: string;

  @Column({ type: 'timestamptz', nullable: true })
  lastWithdrawalAt: Date | null;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;
}
