import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength, IsOptional } from 'class-validator';

export class LoginDto {
  @ApiProperty({
    description: 'Admin email address',
    example: 'admin@cheese.io',
    format: 'email',
  })
  @IsEmail()
  email: string;

  @ApiProperty({
    description: 'Admin password (min 8 characters)',
    example: 'SecurePass123!',
    minLength: 8,
  })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiPropertyOptional({
    description: 'TOTP code required when 2FA is enabled',
    example: '123456',
  })
  @IsOptional()
  @IsString()
  totpCode?: string;
}
