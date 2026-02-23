import {
  IsUUID,
  IsString,
  IsOptional,
  MaxLength,
  IsNumber,
  IsEnum,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum ReconciliationType {
  PAYMENT = 'payment',
  SETTLEMENT = 'settlement',
  REFUND = 'refund',
}

export class ManualReconciliationDto {
  @ApiProperty({ enum: ReconciliationType })
  @IsEnum(ReconciliationType)
  type: ReconciliationType;

  @ApiProperty()
  @IsUUID()
  entityId: string;

  @ApiProperty()
  @IsString()
  @MaxLength(200)
  reason: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  adjustmentAmount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
