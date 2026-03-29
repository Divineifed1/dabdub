import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WaitlistEntry } from './entities/waitlist-entry.entity';
import { WaitlistFraudLog } from './entities/waitlist-fraud-log.entity';
import { WaitlistService } from './waitlist.service';
import { WaitlistFraudService } from './waitlist-fraud.service';
import { WaitlistController } from './waitlist.controller';
import { EmailModule } from '../email/email.module';
import { WsModule } from '../ws/ws.module';
import { CacheModule } from '../cache/cache.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([WaitlistEntry, WaitlistFraudLog]),
    EmailModule,
    WsModule,
    CacheModule,
  ],
  providers: [WaitlistService, WaitlistFraudService],
  controllers: [WaitlistController],
  exports: [WaitlistService, WaitlistFraudService],
})
export class WaitlistModule {}
