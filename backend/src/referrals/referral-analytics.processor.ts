import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { QueueRegistryService } from '../queue/queue.registry';
import { ReferralAnalyticsService } from './referral-analytics.service';

@Processor('analytics') // Use analytics queue or referrals
export class ReferralAnalyticsProcessor {
  private readonly logger = new Logger(ReferralAnalyticsProcessor.name);

  constructor(
    private readonly analyticsService: ReferralAnalyticsService,
    private readonly queueRegistry: QueueRegistryService,
  ) {}

  @Process('compute-referral-analytics')
  async handleComputeAnalytics(job: Job): Promise<void> {
    this.logger.log('Computing referral analytics cache');
    await this.analyticsService.computeAllAnalytics();
    this.logger.log('Referral analytics cache updated');
  }
}

