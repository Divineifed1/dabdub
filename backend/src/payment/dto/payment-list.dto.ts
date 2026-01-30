import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, ValidateNested, IsInt, Min } from 'class-validator';
import { PaymentDetailsDto } from './payment-details.dto';

export class PaymentListDto {
  @ApiProperty({ type: [PaymentDetailsDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PaymentDetailsDto)
  items: PaymentDetailsDto[];

  @ApiProperty({ description: 'Total number of payments' })
  @IsInt()
  @Min(0)
  total: number;

  @ApiProperty({ description: 'Current page number' })
  @IsInt()
  @Min(1)
  page: number;

  @ApiProperty({ description: 'Page size / limit' })
  @IsInt()
  @Min(1)
  limit: number;
}
