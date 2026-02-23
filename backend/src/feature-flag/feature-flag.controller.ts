import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AdminJwtGuard } from '../auth/guards/admin-jwt.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { Permissions } from '../auth/decorators/permissions.decorator';
import {
  CreateFeatureFlagDto,
  SetFlagOverrideDto,
  UpdateFeatureFlagDto,
} from './dto/feature-flag.dto';
import { FeatureFlagService } from './feature-flag.service';
import { KillSwitchGuard } from './guards/kill-switch.guard';

@Controller('api/v1/feature-flags')
@UseGuards(AdminJwtGuard, PermissionGuard)
export class FeatureFlagController {
  constructor(private readonly service: FeatureFlagService) {}

  // ── List all flags ─────────────────────────────────────────────────────────

  @Get()
  @Permissions('config:read')
  listFlags() {
    return this.service.listFlags();
  }

  // ── Get single flag detail ─────────────────────────────────────────────────

  @Get(':flagKey')
  @Permissions('config:read')
  getFlag(@Param('flagKey') flagKey: string) {
    return this.service.getFlag(flagKey);
  }

  // ── Create flag ────────────────────────────────────────────────────────────

  @Post()
  @Permissions('config:write')
  createFlag(@Body() dto: CreateFeatureFlagDto, @CurrentUser() user: any) {
    return this.service.createFlag(dto, user.id);
  }

  // ── Update flag (atomic; cache invalidated within 30s via pub/sub) ─────────

  @Patch(':flagKey')
  @Permissions('config:write')
  @UseGuards(KillSwitchGuard)
  updateFlag(
    @Param('flagKey') flagKey: string,
    @Body() dto: UpdateFeatureFlagDto,
    @CurrentUser() user: any,
  ) {
    return this.service.updateFlag(flagKey, dto, user.id);
  }

  // ── Set per-merchant override ──────────────────────────────────────────────

  @Post(':flagKey/override')
  @Permissions('config:write')
  setOverride(
    @Param('flagKey') flagKey: string,
    @Body() dto: SetFlagOverrideDto,
    @CurrentUser() user: any,
  ) {
    return this.service.setOverride(flagKey, dto, user.id);
  }

  // ── Remove per-merchant override ───────────────────────────────────────────

  @Delete(':flagKey/override/:merchantId')
  @Permissions('config:write')
  removeOverride(
    @Param('flagKey') flagKey: string,
    @Param('merchantId') merchantId: string,
    @CurrentUser() user: any,
  ) {
    return this.service.removeOverride(flagKey, merchantId, user.id);
  }

  // ── Evaluate flag for a specific merchant ──────────────────────────────────

  @Get(':flagKey/evaluate/:merchantId')
  @Permissions('config:read')
  evaluate(
    @Param('flagKey') flagKey: string,
    @Param('merchantId') merchantId: string,
  ) {
    return this.service.evaluateForMerchant(flagKey, merchantId);
  }
}

// ─── Merchant-scoped endpoint ─────────────────────────────────────────────────

@Controller('api/v1/merchants')
@UseGuards(AdminJwtGuard, PermissionGuard)
export class MerchantFeatureFlagsController {
  constructor(private readonly service: FeatureFlagService) {}

  /**
   * GET /api/v1/merchants/:id/feature-flags
   * Returns the evaluation result for every flag for the given merchant.
   */
  @Get(':id/feature-flags')
  @Permissions('config:read')
  getMerchantFlags(@Param('id') merchantId: string) {
    return this.service.evaluateAllForMerchant(merchantId);
  }
}
