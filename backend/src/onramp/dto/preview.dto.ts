import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsPositive } from 'class-validator';

export class PreviewDto {
  @ApiProperty({ example: 10000 })
  @IsNumber()
  @IsPositive()
  amountNgn!: number;
}

export class PreviewResponseDto {
  @ApiProperty({ example: 10000 })
  amountNgn!: number;

  @ApiProperty({ example: 0 })
  feeNgn!: number;

  @ApiProperty({ example: 10000 })
  netNgn!: number;

  @ApiProperty({ example: 6.157635 })
  amountUsdc!: number;

  @ApiProperty({ example: 1600 })
  rateNgnPerUsdc!: number;

  @ApiProperty({ example: 1.5 })
  spreadPercent!: number;

  @ApiProperty({ example: 30 })
  paymentDeadlineMinutes!: number;
}
