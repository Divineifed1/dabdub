import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { CacheModule } from '../cache/cache.module';
import { RedisModule } from '../common/redis';
import { UserEntity } from '../database/entities/user.entity';
import {
  AdminAccessLogController,
  SecurityReportController,
} from './admin-access-log.controller';
import { AdminAccessLog } from './entities/admin-access-log.entity';
import { AdminAccessLogMiddleware } from './middleware/admin-access-log.middleware';
import { AdminAccessLogService } from './services/admin-access-log.service';
import { UnusualActivityDetector } from './services/unusual-activity.detector';

@Module({
  imports: [
    TypeOrmModule.forFeature([AdminAccessLog, UserEntity]),
    AuditModule,
    CacheModule,
    RedisModule,
  ],
  controllers: [AdminAccessLogController, SecurityReportController],
  providers: [AdminAccessLogService, UnusualActivityDetector],
  exports: [AdminAccessLogService],
})
export class AdminAccessLogModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Apply to all /api/v1/** routes so every admin request is captured
    consumer
      .apply(AdminAccessLogMiddleware)
      .forRoutes({ path: 'api/v1/*', method: RequestMethod.ALL });
  }
}
