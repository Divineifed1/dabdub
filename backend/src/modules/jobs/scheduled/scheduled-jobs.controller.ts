import {
    Controller,
    Get,
    Patch,
    Post,
    Param,
    Body,
    Query,
    UseGuards,
    Request,
    HttpCode,
    HttpStatus,
} from '@nestjs/common';
import { JwtGuard } from '../../../auth/guards/jwt.guard';
import { RequirePermissionGuard } from '../../../auth/guards/require-permission.guard';
import { SuperAdminGuard } from '../../../auth/guards/super-admin.guard';
import { RequirePermission } from '../../../auth/decorators/require-permission.decorator';
import { ScheduledJobsService } from './scheduled-jobs.service';
import { UpdateScheduledJobDto } from './dto/update-scheduled-job.dto';

@Controller('api/v1/jobs/scheduled')
@UseGuards(JwtGuard, RequirePermissionGuard)
export class ScheduledJobsController {
    constructor(private readonly scheduledJobsService: ScheduledJobsService) { }

    /** GET /api/v1/jobs/scheduled/overview — health overview (30s cache) */
    @Get('overview')
    @RequirePermission('config:read')
    async getOverview() {
        return this.scheduledJobsService.getOverview();
    }

    /** GET /api/v1/jobs/scheduled — list all scheduled jobs */
    @Get()
    @RequirePermission('config:read')
    async listAll() {
        return this.scheduledJobsService.listAll();
    }

    /** GET /api/v1/jobs/scheduled/:jobKey — job detail with run history */
    @Get(':jobKey')
    @RequirePermission('config:read')
    async getDetail(@Param('jobKey') jobKey: string) {
        return this.scheduledJobsService.getDetail(jobKey);
    }

    /** PATCH /api/v1/jobs/scheduled/:jobKey — update job config */
    @Patch(':jobKey')
    @RequirePermission('config:write')
    async update(
        @Param('jobKey') jobKey: string,
        @Body() dto: UpdateScheduledJobDto,
        @Request() req: any,
    ) {
        return this.scheduledJobsService.update(jobKey, dto, req.user?.role);
    }

    /** POST /api/v1/jobs/scheduled/:jobKey/trigger — manual trigger */
    @Post(':jobKey/trigger')
    @RequirePermission('config:write')
    @HttpCode(HttpStatus.OK)
    async trigger(@Param('jobKey') jobKey: string, @Request() req: any) {
        const triggeredById: string = req.user?.id ?? req.user?.sub ?? 'unknown';
        return this.scheduledJobsService.triggerManually(jobKey, triggeredById);
    }

    /** GET /api/v1/jobs/scheduled/:jobKey/runs — paginated run history */
    @Get(':jobKey/runs')
    @RequirePermission('config:read')
    async getRuns(
        @Param('jobKey') jobKey: string,
        @Query('page') page = '1',
        @Query('limit') limit = '20',
    ) {
        return this.scheduledJobsService.getRuns(
            jobKey,
            Math.max(1, parseInt(page, 10) || 1),
            Math.min(100, Math.max(1, parseInt(limit, 10) || 20)),
        );
    }
}

/**
 * Separate controller binding for the PATCH endpoint when re-enabling
 * auto-disabled jobs.  We export a guard-extended controller to enforce
 * SuperAdmin on the isEnabled=true path for auto-disabled jobs.
 * Logic is in the service — SuperAdminGuard acts as a safety net.
 */
@Controller('api/v1/jobs/scheduled')
@UseGuards(JwtGuard, SuperAdminGuard)
export class ScheduledJobsSuperAdminController {
    constructor(private readonly scheduledJobsService: ScheduledJobsService) { }

    /** PATCH (super-admin) — re-enable an auto-disabled job */
    @Patch(':jobKey/reenable')
    @HttpCode(HttpStatus.OK)
    async reenable(@Param('jobKey') jobKey: string, @Request() req: any) {
        return this.scheduledJobsService.update(
            jobKey,
            { isEnabled: true },
            req.user?.role,
        );
    }
}
