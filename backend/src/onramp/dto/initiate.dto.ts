import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsPositive } from 'class-validator';

export class InitiateDto {
  @ApiProperty({ example: 10000 })
  @IsNumber()
  @IsPositive()
  amountNgn!: number;
}
