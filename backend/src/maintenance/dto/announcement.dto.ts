import { IsString, IsEnum, IsBoolean, IsOptional, IsDateString, IsObject } from 'class-validator';
import { AnnouncementType, AnnouncementAudience } from '../enums/maintenance.enums';

export class CreateAnnouncementDto {
  @IsString()
  title: string;

  @IsString()
  body: string;

  @IsEnum(AnnouncementType)
  type: AnnouncementType;

  @IsEnum(AnnouncementAudience)
  audience: AnnouncementAudience;

  @IsOptional()
  @IsObject()
  audienceFilter?: Record<string, unknown>;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @IsBoolean()
  sendEmail: boolean;
}

export class UpdateAnnouncementDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  body?: string;

  @IsOptional()
  @IsEnum(AnnouncementType)
  type?: AnnouncementType;

  @IsOptional()
  @IsEnum(AnnouncementAudience)
  audience?: AnnouncementAudience;

  @IsOptional()
  @IsObject()
  audienceFilter?: Record<string, unknown>;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @IsOptional()
  @IsBoolean()
  sendEmail?: boolean;
}
