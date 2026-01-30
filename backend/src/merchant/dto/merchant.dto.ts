import {
  IsEmail,
  IsNotEmpty,
  IsString,
  MinLength,
  IsOptional,
  IsEnum,
  IsUrl,
  IsObject,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { KycStatus } from '../../database/entities/merchant.entity';

export class RegisterMerchantDto {
  @ApiProperty({ example: 'John Doe' })
  @IsNotEmpty()
  @IsString()
  name: string;

  @ApiProperty({ example: 'merchant@example.com' })
  @IsNotEmpty()
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'password123', minLength: 8 })
  @IsNotEmpty()
  @IsString()
  @MinLength(8)
  password: string;

  @ApiPropertyOptional({ example: 'My Business LLC' })
  @IsOptional()
  @IsString()
  businessName?: string;
}

export class LoginMerchantDto {
  @ApiProperty({ example: 'merchant@example.com' })
  @IsNotEmpty()
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'password123' })
  @IsNotEmpty()
  @IsString()
  password: string;
}

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'John Doe' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: 'My Business LLC' })
  @IsOptional()
  @IsString()
  businessName?: string;
}

export class BankDetailsDto {
  @ApiProperty({ example: 'Bank of America' })
  @IsNotEmpty()
  @IsString()
  bankName: string;

  @ApiProperty({ example: '1234567890' })
  @IsNotEmpty()
  @IsString()
  accountNumber: string;

  @ApiProperty({ example: 'John Doe' })
  @IsNotEmpty()
  @IsString()
  accountName: string;

  @ApiPropertyOptional({ example: 'BOFAUS3N' })
  @IsOptional()
  @IsString()
  swiftCode?: string;

  @ApiPropertyOptional({ example: '123456789' })
  @IsOptional()
  @IsString()
  routingNumber?: string;
}

export class SettingsDto {
  @ApiPropertyOptional({ example: true })
  @IsOptional()
  emailNotifications?: boolean;

  @ApiPropertyOptional({ example: 'USD' })
  @IsOptional()
  @IsString()
  currency?: string;
}

export class KycDocumentsDto {
  @ApiProperty({ example: 'https://example.com/id.jpg' })
  @IsNotEmpty()
  @IsString() // For now assuming URL strings, might change if file upload is handled differently
  identityDocumentUrl: string;

  @ApiPropertyOptional({ example: 'https://example.com/business.pdf' })
  @IsOptional()
  @IsString()
  businessRegistrationUrl?: string;
}

export class MerchantResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  email: string;

  @ApiProperty({ nullable: true })
  businessName: string;

  @ApiProperty({ enum: KycStatus })
  kycStatus: KycStatus;

  @ApiProperty()
  createdAt: Date;
}
