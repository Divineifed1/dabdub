import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HttpModule } from '@nestjs/axios';
import { HealthController } from './controllers/health.controller';
import { HealthService } from './services/health.service';
import { GlobalConfigModule } from '../config/config.module';
import { BlockchainHealthIndicator } from './indicators/blockchain.health';
import { RedisHealthIndicator } from './indicators/redis.health';
import { CacheModule } from '@nestjs/cache-manager';

@Module({
  imports: [
    TerminusModule,
    HttpModule,
    GlobalConfigModule,
    CacheModule.register(),
  ],
  controllers: [HealthController],
  providers: [HealthService, BlockchainHealthIndicator, RedisHealthIndicator],
})
export class HealthModule {}
