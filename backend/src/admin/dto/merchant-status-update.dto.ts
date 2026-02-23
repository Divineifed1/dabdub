import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MerchantStatus } from '../../database/entities/merchant.entity';

export class MerchantStatusUpdateDto {
  @ApiProperty({ enum: MerchantStatus })
  @IsEnum(MerchantStatus)
  status: MerchantStatus;

  @ApiPropertyOptional({ description: 'Reason for status change' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
