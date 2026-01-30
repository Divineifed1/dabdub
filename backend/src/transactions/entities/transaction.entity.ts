import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum TransactionStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  FAILED = 'failed',
}

@Entity('transactions')
@Index(['txHash'])
@Index(['network'])
// Composite index for common filtering
@Index(['network', 'status'])
export class Transaction {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tx_hash', type: 'varchar', unique: true })
  txHash!: string;

  @Column({ type: 'varchar', length: 50 })
  network!: string;

  @Column({
    type: 'enum',
    enum: TransactionStatus,
    default: TransactionStatus.PENDING,
  })
  status!: TransactionStatus;

  @Column({ type: 'decimal', precision: 36, scale: 18 }) // Large precision for crypto amounts
  amount!: string; // Using string to avoid precision loss

  @Column({ type: 'varchar', length: 10 })
  currency!: string;

  @Column({ name: 'from_address', type: 'varchar' })
  fromAddress!: string;

  @Column({ name: 'to_address', type: 'varchar' })
  toAddress!: string;

  @Column({ name: 'block_number', type: 'bigint', nullable: true })
  blockNumber!: number;

  @Column({ type: 'int', default: 0 })
  confirmations!: number;

  @Column({
    name: 'fee_amount',
    type: 'decimal',
    precision: 36,
    scale: 18,
    nullable: true,
  })
  feeAmount!: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, any>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @Column({ name: 'confirmed_at', type: 'timestamp', nullable: true })
  confirmedAt!: Date;
}
