import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID } from 'class-validator';
import { TokenResponseDto } from './token-response.dto';

export class BiometricAuthenticateDto {
  @ApiProperty()
  @IsString()
  biometricToken!: string;

  @ApiProperty({ example: '2fb760da-7fb4-4e9b-b229-17611c9e1554' })
  @IsUUID()
  deviceId!: string;
}

export class BiometricAuthResponseDto extends TokenResponseDto {
  @ApiProperty()
  biometricToken!: string;
}
