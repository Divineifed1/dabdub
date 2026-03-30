import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CreateTransferDto } from './create-transfer.dto';

export class PreviewTransferDto extends CreateTransferDto {}

export class PreviewTransferResponseDto {
  @ApiProperty()
  toUserId!: string;

  @ApiProperty()
  toUsername!: string;

  @ApiProperty()
  amount!: string;

  @ApiProperty()
  fee!: string;

  @ApiProperty()
  netAmount!: string;

  @ApiProperty()
  isP2p!: boolean;

  @ApiProperty()
  dailyP2pLimit!: string;

  @ApiProperty()
  dailyP2pUsed!: string;

  @ApiProperty()
  dailyP2pRemaining!: string;

  @ApiProperty()
  requiresConfirmation!: boolean;

  @ApiPropertyOptional()
  reason?: string;
}

export class P2pLimitsResponseDto {
  @ApiProperty()
  dailyP2pLimit!: string;

  @ApiProperty()
  dailyP2pUsed!: string;

  @ApiProperty()
  dailyP2pRemaining!: string;

  @ApiProperty()
  hourlyCount!: number;

  @ApiProperty()
  isFlagged!: boolean;
}
