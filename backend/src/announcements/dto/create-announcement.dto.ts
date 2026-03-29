import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUrl,
  Length,
} from 'class-validator';
import {
  AnnouncementTargetAudience,
  AnnouncementType,
} from '../entities/announcement.entity';

export class CreateAnnouncementDto {
  @ApiProperty({ maxLength: 100 })
  @IsString()
  @Length(1, 100)
  title!: string;

  @ApiProperty()
  @IsString()
  @Length(1, 10000)
  body!: string;

  @ApiProperty({ enum: AnnouncementType })
  @IsEnum(AnnouncementType)
  type!: AnnouncementType;

  @ApiProperty({ enum: AnnouncementTargetAudience })
  @IsEnum(AnnouncementTargetAudience)
  targetAudience!: AnnouncementTargetAudience;

  @ApiPropertyOptional({ maxLength: 50, nullable: true })
  @IsOptional()
  @IsString()
  @Length(1, 50)
  ctaLabel?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsUrl({ require_tld: false })
  ctaUrl?: string | null;

  @ApiProperty({ default: true })
  @IsBoolean()
  isDismissible!: boolean;

  @ApiProperty()
  @IsDateString()
  showFrom!: string;

  @ApiProperty()
  @IsDateString()
  showUntil!: string;
}
