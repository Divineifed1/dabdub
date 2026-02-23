import {
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AdminJwtGuard } from '../auth/guards/admin-jwt.guard';
import { SuperAdminGuard } from '../auth/guards/super-admin.guard';
import {
  AccessLogQueryDto,
  AccessSummaryQueryDto,
} from './dto/admin-access-log.dto';
import { AdminAccessLogService } from './services/admin-access-log.service';

/**
 * Admin access-monitoring endpoints.
 * All routes are SUPER_ADMIN only.
 */
@Controller('api/v1/admin/users')
@UseGuards(AdminJwtGuard, SuperAdminGuard)
export class AdminAccessLogController {
  constructor(private readonly service: AdminAccessLogService) {}

  // ── Paginated access history for one admin ─────────────────────────────────

  @Get(':id/access-log')
  getAccessLog(
    @Param('id', ParseUUIDPipe) adminId: string,
    @Query() query: AccessLogQueryDto,
  ) {
    return this.service.getAccessLog(adminId, query);
  }

  // ── Access pattern summary (cached 5 min) ──────────────────────────────────

  @Get(':id/access-summary')
  getAccessSummary(
    @Param('id', ParseUUIDPipe) adminId: string,
    @Query() query: AccessSummaryQueryDto,
  ) {
    return this.service.getAccessSummary(adminId, query);
  }

  // ── Historical session list ────────────────────────────────────────────────

  @Get(':id/sessions')
  getSessions(@Param('id', ParseUUIDPipe) adminId: string) {
    return this.service.getSessionHistory(adminId);
  }

  // ── Force-terminate a session ──────────────────────────────────────────────

  @Post(':id/terminate-session/:sessionId')
  terminateSession(
    @Param('id', ParseUUIDPipe) targetAdminId: string,
    @Param('sessionId') sessionId: string,
    @CurrentUser() actor: any,
  ) {
    return this.service.terminateSession(targetAdminId, sessionId, actor.id);
  }
}

/**
 * Cross-admin activity report for compliance.
 */
@Controller('api/v1/security')
@UseGuards(AdminJwtGuard, SuperAdminGuard)
export class SecurityReportController {
  constructor(private readonly service: AdminAccessLogService) {}

  @Get('admin-activity-report')
  getActivityReport(
    @Query() query: AccessSummaryQueryDto,
    @CurrentUser() actor: any,
  ) {
    return this.service.getActivityReport(query.period ?? '30d', actor.id);
  }
}
