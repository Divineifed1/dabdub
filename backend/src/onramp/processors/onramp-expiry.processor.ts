import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { Logger } from '@nestjs/common';
import { OnRampService } from '../onramp.service';

export const ONRAMP_QUEUE = 'onramp';
export const EXPIRE_ONRAMP_ORDERS_JOB = 'expire-onramp-orders';

@Processor(ONRAMP_QUEUE)
export class OnRampExpiryProcessor {
  private readonly logger = new Logger(OnRampExpiryProcessor.name);

  constructor(private readonly onRampService: OnRampService) {}

  @Process(EXPIRE_ONRAMP_ORDERS_JOB)
  async handleExpirySweep(job: Job): Promise<void> {
    const expiredCount = await this.onRampService.expireStaleOrders();
    this.logger.debug(
      `Expired ${expiredCount} stale on-ramp orders for job ${job.name}`,
    );
  }
}
