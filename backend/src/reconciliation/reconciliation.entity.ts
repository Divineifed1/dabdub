import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum ReconciliationStatus {
  MATCHED = 'matched',
  DISCREPANCY = 'discrepancy',
  PENDING = 'pending',
  MANUALLY_RESOLVED = 'manually_resolved',
}

export enum DiscrepancyType {
  AMOUNT_MISMATCH = 'amount_mismatch',
  MISSING_TRANSACTION = 'missing_transaction',
  DUPLICATE_TRANSACTION = 'duplicate_transaction',
  TIMING_MISMATCH = 'timing_mismatch',
  CURRENCY_MISMATCH = 'currency_mismatch',
}

@Entity('reconciliations')
@Index(['status'])
@Index(['paymentRequestId'])
@Index(['transactionId'])
export class Reconciliation {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'payment_request_id', type: 'uuid', nullable: true })
  paymentRequestId!: string;

  @Column({ name: 'transaction_id', type: 'uuid', nullable: true })
  transactionId!: string;

  @Column({ name: 'settlement_id', type: 'uuid', nullable: true })
  settlementId!: string;

  @Column({
    type: 'enum',
    enum: ReconciliationStatus,
    default: ReconciliationStatus.PENDING,
  })
  status!: ReconciliationStatus;

  @Column({
    name: 'discrepancy_type',
    type: 'enum',
    enum: DiscrepancyType,
    nullable: true,
  })
  discrepancyType!: DiscrepancyType;

  @Column({ name: 'expected_amount', type: 'decimal', precision: 36, scale: 18, nullable: true })
  expectedAmount!: string;

  @Column({ name: 'actual_amount', type: 'decimal', precision: 36, scale: 18, nullable: true })
  actualAmount!: string;

  @Column({ name: 'amount_variance', type: 'decimal', precision: 36, scale: 18, nullable: true })
  amountVariance!: string;

  @Column({ type: 'varchar', length: 10, nullable: true })
  currency!: string;

  @Column({ name: 'discrepancy_notes', type: 'text', nullable: true })
  discrepancyNotes!: string;

  @Column({ name: 'resolved_by', type: 'varchar', nullable: true })
  resolvedBy!: string;

  @Column({ name: 'resolved_at', type: 'timestamp', nullable: true })
  resolvedAt!: Date;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, any>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
