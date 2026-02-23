import { Processor, Process } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MaintenanceWindow } from '../entities/maintenance-window.entity';

@Processor('maintenance')
export class MaintenanceProcessor {
  private readonly logger = new Logger(MaintenanceProcessor.name);

  constructor(
    @InjectRepository(MaintenanceWindow)
    private maintenanceRepo: Repository<MaintenanceWindow>,
  ) {}

  @Process('notify-maintenance')
  async handleMaintenanceNotification(job: Job<{ maintenanceId: string; notifyAt: Date }>) {
    const { maintenanceId } = job.data;
    const window = await this.maintenanceRepo.findOne({ where: { id: maintenanceId } });
    
    if (!window) {
      this.logger.warn(`Maintenance window ${maintenanceId} not found`);
      return;
    }

    this.logger.log(`Sending maintenance notification for: ${window.title}`);
    // Email sending logic would go here
    return { sent: true, maintenanceId };
  }

  @Process('notify-maintenance-complete')
  async handleMaintenanceComplete(job: Job<{ maintenanceId: string }>) {
    const { maintenanceId } = job.data;
    const window = await this.maintenanceRepo.findOne({ where: { id: maintenanceId } });
    
    if (!window) {
      this.logger.warn(`Maintenance window ${maintenanceId} not found`);
      return;
    }

    this.logger.log(`Sending maintenance completion notification for: ${window.title}`);
    // Email sending logic would go here
    return { sent: true, maintenanceId };
  }

  @Process('notify-maintenance-cancelled')
  async handleMaintenanceCancelled(job: Job<{ maintenanceId: string }>) {
    const { maintenanceId } = job.data;
    const window = await this.maintenanceRepo.findOne({ where: { id: maintenanceId } });
    
    if (!window) {
      this.logger.warn(`Maintenance window ${maintenanceId} not found`);
      return;
    }

    this.logger.log(`Sending maintenance cancellation notification for: ${window.title}`);
    // Email sending logic would go here
    return { sent: true, maintenanceId };
  }
}
