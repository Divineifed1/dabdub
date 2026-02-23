import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

// ─── Query DTOs ────────────────────────────────────────────────────────────────

export class AccessLogQueryDto {
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsIn(['GET', 'POST', 'PATCH', 'PUT', 'DELETE'])
  method?: string;

  @IsOptional()
  @IsString()
  resourceType?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number = 50;
}

export class AccessSummaryQueryDto {
  @IsOptional()
  @IsIn(['7d', '30d', '90d'])
  period?: '7d' | '30d' | '90d' = '30d';
}

// ─── Response shapes ───────────────────────────────────────────────────────────

export interface AccessLogEntryDto {
  id: string;
  method: string;
  path: string;
  resourceType: string;
  resourceId: string | null;
  statusCode: number;
  durationMs: number;
  ipAddress: string;
  correlationId: string;
  createdAt: Date;
}

export interface AccessLogPageDto {
  data: AccessLogEntryDto[];
  meta: { total: number; page: number; limit: number };
}

export interface UnusualActivityDto {
  type: string;
  description: string;
}

export interface RequestsByDayDto {
  date: string;
  count: number;
}

export interface TopResourceDto {
  resourceType: string;
  count: number;
}

export interface AccessSummaryDto {
  adminId: string;
  period: string;
  totalRequests: number;
  uniqueIpAddresses: number;
  requestsByDay: RequestsByDayDto[];
  topAccessedResources: TopResourceDto[];
  unusualActivity: UnusualActivityDto[];
}

export interface SessionHistoryDto {
  sessionId: string;
  ipAddress: string | undefined;
  userAgent: string | undefined;
  createdAt: string;
  lastUsedAt: string;
  requestCount: number;
  isActive: boolean;
}

export interface AdminSummaryRowDto {
  admin: { id: string; email: string; role: string };
  totalRequests: number;
  mutationCount: number;
  uniqueMerchantsAccessed: number;
  unusualActivityFlags: number;
  lastActiveAt: Date | null;
}

export interface ActivityReportDto {
  period: string;
  adminSummaries: AdminSummaryRowDto[];
  platformTotals: {
    totalAdminRequests: number;
    totalMutations: number;
    adminsWithUnusualActivity: number;
  };
}
