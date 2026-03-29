import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CacheModule } from '../cache/cache.module';
import { NotificationModule } from '../notification/notification.module';
// AppConfigModule is global, no need to import
import { UserEntity } from '../database/entities/user.entity';
import { StellarModule } from '../stellar/stellar.module';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { Referral } from './entities/referral.entity';
import { ReferralProcessor } from './referral.processor';
import { ReferralsController } from './referrals.controller';
import { ReferralService } from './referral.service';
import { ReferralAnalyticsService } from './referral-analytics.service';
import { ReferralAnalyticsProcessor } from './referral-analytics.processor';

@Module({
  imports: [
AppConfigModule,
    NotificationModule,
    StellarModule,
    TypeOrmModule.forFeature([Referral, UserEntity]),
    BullModule.registerQueue({
      name: 'referrals',
    }),
    CacheModule,
  ],
  controllers: [ReferralsController],
  providers: [ReferralService, ReferralProcessor, ReferralAnalyticsService, ReferralAnalyticsProcessor, JwtGuard],
  exports: [ReferralService, ReferralAnalyticsService],
})
export class ReferralsModule {}
