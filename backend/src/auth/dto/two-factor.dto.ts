import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, MinLength, MaxLength } from 'class-validator';

export class TwoFactorSetupResponseDto {
  @ApiProperty({
    description: 'TOTP secret in base32 format',
    example: 'JBSWY3DPEHPK3PXP',
  })
  secret: string;

  @ApiProperty({
    description: 'QR code as base64 PNG data URL',
    example: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...',
  })
  qrCode: string;

  @ApiProperty({
    description: 'OTP Auth URI for manual entry',
    example: 'otpauth://totp/Cheese%20Admin:admin@cheese.io?secret=JBSWY3DPEHPK3PXP&issuer=Cheese%20Admin',
  })
  qrUri: string;

  @ApiProperty({
    description: 'Time in seconds until setup expires',
    example: 600,
  })
  expiresInSeconds: number;
}

export class VerifySetupDto {
  @ApiProperty({
    description: '6-digit TOTP code',
    example: '123456',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  @MaxLength(6)
  totpCode: string;
}

export class VerifySetupResponseDto {
  @ApiProperty({
    description: 'Whether 2FA is now enabled',
    example: true,
  })
  enabled: boolean;

  @ApiProperty({
    description: 'Backup codes (shown only once)',
    example: ['ABCD-EFGH-IJKL', 'MNOP-QRST-UVWX'],
    type: [String],
  })
  backupCodes: string[];
}

export class DisableTwoFactorDto {
  @ApiProperty({
    description: '6-digit TOTP code',
    example: '123456',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  @MaxLength(6)
  totpCode: string;

  @ApiProperty({
    description: 'Admin password for verification',
    example: 'SecurePassword123!',
  })
  @IsString()
  @IsNotEmpty()
  password: string;
}

export class ValidateTwoFactorDto {
  @ApiProperty({
    description: 'Short-lived JWT token from login step 1',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  @IsString()
  @IsNotEmpty()
  twoFactorToken: string;

  @ApiProperty({
    description: '6-digit TOTP code (mutually exclusive with backupCode)',
    example: '123456',
    required: false,
  })
  @IsString()
  totpCode?: string;

  @ApiProperty({
    description: 'Backup code in format XXXX-XXXX-XXXX (mutually exclusive with totpCode)',
    example: 'ABCD-EFGH-IJKL',
    required: false,
  })
  @IsString()
  backupCode?: string;
}

export class ValidateTwoFactorResponseDto {
  @ApiProperty({
    description: 'Full access JWT token',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  access_token: string;

  @ApiProperty({
    description: 'Refresh token',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  refresh_token: string;

  @ApiProperty({
    description: 'Token expiration time in seconds',
    example: 7200,
  })
  expires_in: number;

  @ApiProperty({
    description: 'Admin user information',
  })
  admin: {
    id: string;
    email: string;
    role: string;
  };
}

export class RegenerateBackupCodesDto {
  @ApiProperty({
    description: '6-digit TOTP code for verification',
    example: '123456',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  @MaxLength(6)
  totpCode: string;
}

export class RegenerateBackupCodesResponseDto {
  @ApiProperty({
    description: 'New backup codes (shown only once)',
    example: ['ABCD-EFGH-IJKL', 'MNOP-QRST-UVWX'],
    type: [String],
  })
  backupCodes: string[];
}
