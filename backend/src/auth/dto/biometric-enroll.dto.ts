import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID } from 'class-validator';

export class BiometricEnrollDto {
  @ApiProperty({ example: '2fb760da-7fb4-4e9b-b229-17611c9e1554' })
  @IsUUID()
  deviceId!: string;
}

export class BiometricEnrollResponseDto {
  @ApiProperty()
  @IsString()
  biometricToken!: string;
}
