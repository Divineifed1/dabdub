import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { RedisModule } from '../common/redis';
import { Merchant } from '../merchant/entities/merchant.entity';
import {
  FeatureFlagController,
  MerchantFeatureFlagsController,
} from './feature-flag.controller';
import { FeatureFlagService } from './feature-flag.service';
import { FeatureFlag } from './entities/feature-flag.entity';
import { KillSwitchGuard } from './guards/kill-switch.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([FeatureFlag, Merchant]),
    AuditModule,
    RedisModule,
  ],
  controllers: [FeatureFlagController, MerchantFeatureFlagsController],
  providers: [FeatureFlagService, KillSwitchGuard],
  exports: [FeatureFlagService],
})
export class FeatureFlagModule {}
