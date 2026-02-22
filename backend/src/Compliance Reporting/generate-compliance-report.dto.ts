import {
  IsEnum,
  IsDateString,
  IsOptional,
  IsUUID,
  IsString,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ComplianceReportType, ReportFormat } from '../enums/compliance-report.enum';

export class GenerateComplianceReportDto {
  @ApiProperty({ enum: ComplianceReportType })
  @IsEnum(ComplianceReportType)
  reportType: ComplianceReportType;

  @ApiProperty({ example: '2026-01-01' })
  @IsDateString()
  startDate: string;

  @ApiProperty({ example: '2026-01-31' })
  @IsDateString()
  endDate: string;

  @ApiProperty({ enum: ReportFormat })
  @IsEnum(ReportFormat)
  format: ReportFormat;

  @ApiPropertyOptional({ description: 'Filter by merchant UUID. Omit for all merchants.' })
  @IsOptional()
  @IsUUID()
  merchantId?: string;

  @ApiPropertyOptional({ minLength: 10, description: 'Optional audit notes' })
  @IsOptional()
  @IsString()
  @MinLength(10)
  notes?: string;
}
