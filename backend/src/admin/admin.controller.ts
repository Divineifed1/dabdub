import {
  Controller,
  Get,
  Put,
  Post,
  Param,
  Query,
  Body,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { AdminJwtGuard } from '../auth/guards/admin-jwt.guard';
import { ApiAdminAuth } from '../common/decorators/swagger/api-admin-auth.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AdminService } from './admin.service';
import { MerchantsService } from './merchants/merchants.service';
import { HealthService } from '../health/services/health.service';
import { ListMerchantsQueryDto } from './merchants/dto/list-merchants-query.dto';
import { AdminPaymentFiltersDto } from './dto/admin-payment-filters.dto';
import { AuditLogFiltersDto } from './dto/audit-log-filters.dto';
import { MerchantStatusUpdateDto } from './dto/merchant-status-update.dto';
import { ManualReconciliationDto } from './dto/manual-reconciliation.dto';
import { Request } from 'express';

@ApiTags('Admin - Platform Administration')
@Controller('api/v1/admin')
@UseGuards(AdminJwtGuard)
@ApiAdminAuth()
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly merchantsService: MerchantsService,
    private readonly healthService: HealthService,
  ) {}

  // ==================== Merchant Management ====================

  @Get('merchants')
  @ApiOperation({
    summary: 'List all merchants with advanced filtering and search',
    description:
      'Admin endpoint to list merchants with comprehensive filtering, search, and sorting capabilities',
  })
  @ApiResponse({ status: 200, description: 'Merchants retrieved successfully' })
  async listMerchants(@Query() query: ListMerchantsQueryDto) {
    return this.merchantsService.listMerchants(query);
  }

  @Get('merchants/:id')
  @ApiOperation({
    summary: 'Get merchant details by ID',
    description:
      'Retrieve full merchant details including stats and related information',
  })
  @ApiParam({ name: 'id', description: 'Merchant UUID' })
  @ApiResponse({ status: 200, description: 'Merchant details retrieved' })
  @ApiResponse({ status: 404, description: 'Merchant not found' })
  async getMerchantById(@Param('id') id: string) {
    return this.adminService.getMerchantById(id);
  }

  @Put('merchants/:id/status')
  @ApiOperation({
    summary: 'Update merchant status (suspend/activate)',
    description: 'Admin endpoint to change merchant status with audit logging',
  })
  @ApiParam({ name: 'id', description: 'Merchant UUID' })
  @ApiResponse({ status: 200, description: 'Merchant status updated' })
  @ApiResponse({ status: 404, description: 'Merchant not found' })
  async updateMerchantStatus(
    @Param('id') id: string,
    @Body() updateDto: MerchantStatusUpdateDto,
    @CurrentUser() user: any,
    @Req() req: Request,
  ) {
    const ipAddress = req.ip || req.socket.remoteAddress;
    return this.adminService.updateMerchantStatus(
      id,
      updateDto,
      user.id,
      ipAddress,
    );
  }

  // ==================== Payment Management ====================

  @Get('payments')
  @ApiOperation({
    summary: 'List all payments with advanced filters',
    description:
      'Admin endpoint to view all payments across merchants with comprehensive filtering',
  })
  @ApiResponse({ status: 200, description: 'Payments retrieved successfully' })
  async getPayments(@Query() filters: AdminPaymentFiltersDto) {
    return this.adminService.getPayments(filters);
  }

  // ==================== Settlement Management ====================

  @Post('settlements/:id/retry')
  @ApiOperation({
    summary: 'Manually retry a failed settlement',
    description:
      'Admin endpoint to retry failed settlements with audit logging',
  })
  @ApiParam({ name: 'id', description: 'Settlement UUID' })
  @ApiResponse({ status: 200, description: 'Settlement retry initiated' })
  @ApiResponse({ status: 404, description: 'Settlement not found' })
  @ApiResponse({
    status: 400,
    description: 'Settlement cannot be retried (not in failed status)',
  })
  async retrySettlement(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Req() req: Request,
  ) {
    const ipAddress = req.ip || req.socket.remoteAddress;
    return this.adminService.retrySettlement(id, user.id, ipAddress);
  }

  // ==================== System Health & Monitoring ====================

  @Get('system/health')
  @ApiOperation({
    summary: 'Comprehensive system health check',
    description:
      'Detailed health status of all system components including database, Redis, blockchain, etc.',
  })
  @ApiResponse({ status: 200, description: 'System health status' })
  async getSystemHealth() {
    return this.healthService.checkDetailed();
  }

  @Get('system/metrics')
  @ApiOperation({
    summary: 'Platform-wide metrics and statistics',
    description:
      'Get aggregated metrics for merchants, payments, settlements, and system performance',
  })
  @ApiResponse({ status: 200, description: 'System metrics retrieved' })
  async getSystemMetrics() {
    return this.adminService.getSystemMetrics();
  }

  // ==================== Audit Logs ====================

  @Get('audit-logs')
  @ApiOperation({
    summary: 'Search and filter audit logs',
    description:
      'Admin endpoint to view audit logs with comprehensive filtering capabilities',
  })
  @ApiResponse({ status: 200, description: 'Audit logs retrieved' })
  async getAuditLogs(@Query() filters: AuditLogFiltersDto) {
    return this.adminService.getAuditLogs(filters);
  }

  // ==================== Manual Operations ====================

  @Post('manual-reconciliation')
  @ApiOperation({
    summary: 'Perform manual reconciliation',
    description:
      'Admin endpoint to manually reconcile payments, settlements, or refunds with full audit trail',
  })
  @ApiResponse({ status: 200, description: 'Reconciliation completed' })
  @ApiResponse({ status: 404, description: 'Entity not found' })
  async performManualReconciliation(
    @Body() dto: ManualReconciliationDto,
    @CurrentUser() user: any,
    @Req() req: Request,
  ) {
    const ipAddress = req.ip || req.socket.remoteAddress;
    return this.adminService.performManualReconciliation(
      dto,
      user.id,
      ipAddress,
    );
  }
}
