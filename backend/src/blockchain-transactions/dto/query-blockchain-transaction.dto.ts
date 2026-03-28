import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsUUID, Min } from 'class-validator';
import { BlockchainTransactionStatus, BlockchainTransactionType } from '../entities/blockchain-transaction.entity';

export class QueryBlockchainTransactionDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit: number = 20;

  @IsOptional()
  @IsEnum(BlockchainTransactionType)
  type?: BlockchainTransactionType;

  @IsOptional()
  @IsEnum(BlockchainTransactionStatus)
  status?: BlockchainTransactionStatus;
}
