import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WebhookController } from './controllers/webhook.controller';
import { WebhookService } from './services/webhook.service';
import { WebhookConfigurationEntity } from '../database/entities/webhook-configuration.entity';
import { WebhookDeliveryLogEntity } from '../database/entities/webhook-delivery-log.entity';
import { WebhookDeliveryLogMaintenanceService } from './services/webhook-delivery-log-maintenance.service';
import { WebhookDeliveryService } from './services/webhook-delivery.service';
import { WebhookHealthMonitorService } from './services/webhook-health-monitor.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      WebhookConfigurationEntity,
      WebhookDeliveryLogEntity,
    ]),
  ],
  controllers: [WebhookController],
  providers: [
    WebhookService,
    WebhookDeliveryLogMaintenanceService,
    WebhookDeliveryService,
    WebhookHealthMonitorService,
  ],
  exports: [WebhookService, WebhookDeliveryService],
})
export class WebhookModule {}
