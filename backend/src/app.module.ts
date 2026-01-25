import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { LoggerModule } from './logger/logger.module';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { ErrorMonitoringModule } from './common/monitoring/error-monitoring.module';
import { ErrorMonitoringController } from './common/monitoring/error-monitoring.controller';

@Module({
  imports: [LoggerModule, ErrorMonitoringModule],
  controllers: [AppController, ErrorMonitoringController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
