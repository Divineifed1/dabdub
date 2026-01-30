import { ApiProperty } from '@nestjs/swagger';
import {
  IsUUID,
  IsString,
  IsNumber,
  IsDate,
  IsOptional,
} from 'class-validator';
import { Type } from 'class-transformer';

export class PaymentReceiptDto {
  @ApiProperty({ description: 'Receipt ID', type: String })
  @IsUUID()
  id: string;

  @ApiProperty({ description: 'Payment amount' })
  @IsNumber()
  amount: number;

  @ApiProperty({ description: 'Currency' })
  @IsString()
  currency: string;

  @ApiProperty({ description: 'Receipt number' })
  @IsString()
  receiptNumber: string;

  @ApiProperty({ description: 'Payment date/time' })
  @Type(() => Date)
  @IsDate()
  paidAt: Date;

  @ApiProperty({
    description: 'Optional line items or extra receipt details',
    required: false,
    type: [Object],
  })
  @IsOptional()
  lines?: any[];
}
