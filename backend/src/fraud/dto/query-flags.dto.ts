import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { FraudSeverity, FraudStatus } from '../entities/fraud-flag.entity';

export class QueryFlagsDto {
  @IsOptional()
  @IsEnum(FraudSeverity)
  severity?: FraudSeverity;

  @IsOptional()
  @IsEnum(FraudStatus)
  status?: FraudStatus;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 20;
}
