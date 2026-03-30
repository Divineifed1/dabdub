import { ApiProperty } from '@nestjs/swagger';

export class BiometricDeviceResponseDto {
  @ApiProperty()
  deviceId!: string;

  @ApiProperty()
  deviceName!: string;

  @ApiProperty({ nullable: true })
  lastUsedAt!: string | null;

  @ApiProperty()
  expiresAt!: string;
}
