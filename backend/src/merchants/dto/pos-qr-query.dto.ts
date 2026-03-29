import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsNumber, IsString, Min } from 'class-validator';

export class PosQrQueryDto {
  @ApiPropertyOptional({ 
    example: '10.00', 
    description: 'Pre-filled amount for one-time QR' 
  })
  @IsOptional()
  @IsNumber()
  @Min(0.01)
  amount?: number;

  @ApiPropertyOptional({ 
    example: 'Coffee', 
    description: 'Optional payment note' 
  })
  @IsOptional()
  @IsString()
  note?: string;
}
