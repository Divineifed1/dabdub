import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { MaintenanceService } from '../services/maintenance.service';
import { ScheduleMaintenanceDto, CancelMaintenanceDto } from '../dto/maintenance.dto';
import { MaintenanceStatus } from '../enums/maintenance.enums';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../../auth/guards/permission.guard';
import { SuperAdminGuard } from '../../auth/guards/super-admin.guard';
import { Permissions } from '../../auth/decorators/permissions.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';

@Controller('api/v1/maintenance/windows')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class MaintenanceController {
  constructor(private readonly maintenanceService: MaintenanceService) {}

  @Get()
  @Permissions('config:read')
  async listMaintenanceWindows(
    @Query('status') status?: MaintenanceStatus,
    @Query('createdAfter') createdAfter?: string,
    @Query('createdBefore') createdBefore?: string,
  ) {
    return this.maintenanceService.listMaintenanceWindows(
      status,
      createdAfter ? new Date(createdAfter) : undefined,
      createdBefore ? new Date(createdBefore) : undefined,
    );
  }

  @Post()
  @Permissions('config:write')
  async scheduleMaintenanceWindow(
    @Body() dto: ScheduleMaintenanceDto,
    @CurrentUser() user: any,
  ) {
    return this.maintenanceService.scheduleMaintenanceWindow(dto, user.id);
  }

  @Post(':id/start')
  @UseGuards(SuperAdminGuard)
  async startMaintenance(@Param('id') id: string, @CurrentUser() user: any) {
    return this.maintenanceService.startMaintenance(id, user.id);
  }

  @Post(':id/end')
  @UseGuards(SuperAdminGuard)
  async endMaintenance(@Param('id') id: string, @CurrentUser() user: any) {
    return this.maintenanceService.endMaintenance(id, user.id);
  }

  @Post(':id/cancel')
  @Permissions('config:write')
  async cancelMaintenance(
    @Param('id') id: string,
    @Body() dto: CancelMaintenanceDto,
    @CurrentUser() user: any,
  ) {
    return this.maintenanceService.cancelMaintenance(id, dto, user.id);
  }
}
