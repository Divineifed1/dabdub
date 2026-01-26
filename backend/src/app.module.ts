import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { SettlementModule } from './settlement/settlement.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database/database.module';
import { LoggerModule } from './logger/logger.module';
import { CacheModule } from './cache/cache.module';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { GlobalConfigModule } from './config/config.module';
import { BullModule } from '@nestjs/bull';
import { NotificationModule } from './notification/notification.module';
import { GlobalConfigService } from './config/global-config.service';

@Module({
  imports: [
    GlobalConfigModule,
    DatabaseModule,
    LoggerModule,
    ScheduleModule.forRoot(),
    BullModule.forRootAsync({
      imports: [GlobalConfigModule],
      useFactory: async (configService: GlobalConfigService) => ({
        redis: {
          host: configService.getRedisConfig().host,
          port: configService.getRedisConfig().port,
        },
      }),
      inject: [GlobalConfigService],
    }),
    NotificationModule,
    SettlementModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
