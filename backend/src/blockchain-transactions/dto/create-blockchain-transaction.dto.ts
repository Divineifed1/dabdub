import { IsEnum, IsNotEmpty, IsOptional, IsUUID, IsString } from 'class-validator';
import { BlockchainTransactionType, BlockchainTransactionStatus } from '../entities/blockchain-transaction.entity';

export class CreateBlockchainTransactionDto {
  @IsUUID()
  userId!: string;

  @IsEnum(BlockchainTransactionType)
  type!: BlockchainTransactionType;

  @IsNotEmpty()
  @IsString()
  fromAddress!: string;

  @IsOptional()
  @IsString()
  toAddress?: string;

  @IsNotEmpty()
  @IsString()
  amountUsdc!: string;

  @IsOptional()
  @IsString()
  feeStroops?: string;

  @IsNotEmpty()
  @IsString()
  referenceId!: string;

  @IsOptional()
  @IsString()
  errorMessage?: string;

  // This DTO intentionally does not carry txHash; it starts null
  @IsOptional()
  @IsEnum(BlockchainTransactionStatus)
  status?: BlockchainTransactionStatus;
}
