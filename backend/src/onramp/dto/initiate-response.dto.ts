import { ApiProperty } from '@nestjs/swagger';

export class InitiateResponseDto {
  @ApiProperty()
  reference!: string;

  @ApiProperty()
  amountNgn!: number;

  @ApiProperty()
  accountNumber!: string;

  @ApiProperty()
  bankName!: string;

  @ApiProperty({ required: false, nullable: true })
  accountName!: string | null;

  @ApiProperty()
  expiresAt!: Date;
}
