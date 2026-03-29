import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';

export enum BlockchainTransactionType {
  DEPOSIT = 'deposit',
  WITHDRAWAL = 'withdrawal',
  TRANSFER = 'transfer',
  STAKE = 'stake',
  UNSTAKE = 'unstake',
  PAYLINK_PAYMENT = 'paylink_payment',
}

export enum BlockchainTransactionStatus {
  PENDING = 'pending',
  SUBMITTED = 'submitted',
  CONFIRMED = 'confirmed',
  FAILED = 'failed',
}

@Index('IDX_blockchain_transactions_user_id_created_at', ['userId', 'createdAt'])
@Index('IDX_blockchain_transactions_reference_id', ['referenceId'])
@Index('IDX_blockchain_transactions_status', ['status'])
@Index('UQ_blockchain_transactions_tx_hash', ['txHash'], { unique: true })
@Entity('blockchain_transactions')
export class BlockchainTransaction extends BaseEntity {
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ type: 'enum', enum: BlockchainTransactionType })
  type!: BlockchainTransactionType;

  @Column({ name: 'tx_hash', type: 'varchar', nullable: true, unique: true })
  txHash!: string | null;

  @Column({ type: 'enum', enum: BlockchainTransactionStatus, default: BlockchainTransactionStatus.PENDING })
  status!: BlockchainTransactionStatus;

  @Column({ name: 'from_address', type: 'varchar' })
  fromAddress!: string;

  @Column({ name: 'to_address', type: 'varchar', nullable: true })
  toAddress!: string | null;

  @Column({ name: 'amount_usdc', type: 'varchar' })
  amountUsdc!: string;

  @Column({ name: 'fee_stroops', type: 'varchar', nullable: true })
  feeStroops!: string | null;

  @Column({ type: 'integer', nullable: true })
  ledger!: number | null;

  @Column({ name: 'error_message', type: 'varchar', nullable: true })
  errorMessage!: string | null;

  @Column({ name: 'reference_id', type: 'varchar' })
  referenceId!: string;

  @Column({ name: 'confirmed_at', type: 'timestamptz', nullable: true })
  confirmedAt!: Date | null;
}
