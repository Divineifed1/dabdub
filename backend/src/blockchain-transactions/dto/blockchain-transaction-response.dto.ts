import { BlockchainTransaction, BlockchainTransactionStatus, BlockchainTransactionType } from '../entities/blockchain-transaction.entity';

export interface PaginatedBlockchainTransactionsDto {
  items: BlockchainTransaction[];
  total: number;
  page: number;
  limit: number;
}

export class BlockchainTransactionResponseDto {
  id!: string;
  userId!: string;
  type!: BlockchainTransactionType;
  txHash!: string | null;
  status!: BlockchainTransactionStatus;
  fromAddress!: string;
  toAddress!: string | null;
  amountUsdc!: string;
  feeStroops!: string | null;
  ledger!: number | null;
  errorMessage!: string | null;
  referenceId!: string;
  createdAt!: Date;
  updatedAt!: Date;
  confirmedAt!: Date | null;

  static fromEntity(entity: BlockchainTransaction): BlockchainTransactionResponseDto {
    return {
      ...entity,
    } as BlockchainTransactionResponseDto;
  }
}
