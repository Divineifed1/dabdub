import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WebhookConfigurationEntity } from '../../database/entities/webhook-configuration.entity';

@Injectable()
export class WebhookHealthMonitorService {
  private readonly logger = new Logger(WebhookHealthMonitorService.name);

  constructor(
    @InjectRepository(WebhookConfigurationEntity)
    private readonly webhookRepository: Repository<WebhookConfigurationEntity>,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async monitorHealth(): Promise<void> {
    const activeWebhooks = await this.webhookRepository.find({
      where: { isActive: true },
    });
    const now = new Date();

    await Promise.all(
      activeWebhooks.map(async (webhook) => {
        if (
          webhook.maxFailureCount &&
          webhook.failureCount >= webhook.maxFailureCount
        ) {
          webhook.isActive = false;
          webhook.disabledAt = now;
          webhook.disabledReason = 'Exceeded maximum failure count';
          await this.webhookRepository.save(webhook);
          this.logger.warn(`Paused unhealthy webhook ${webhook.id}`);
        }
      }),
    );
  }
}
