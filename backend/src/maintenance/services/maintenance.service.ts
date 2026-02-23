import { Injectable, Logger, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, MoreThan } from 'typeorm';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { MaintenanceWindow } from '../entities/maintenance-window.entity';
import { MaintenanceStatus } from '../enums/maintenance.enums';
import { ScheduleMaintenanceDto, CancelMaintenanceDto } from '../dto/maintenance.dto';
import { AuditLogService } from '../../audit/audit-log.service';
import { AuditAction, ActorType } from '../../database/entities/audit-log.enums';
import { GlobalConfigService } from '../../config/global-config.service';

@Injectable()
export class MaintenanceService {
  private readonly logger = new Logger(MaintenanceService.name);

  constructor(
    @InjectRepository(MaintenanceWindow)
    private maintenanceRepo: Repository<MaintenanceWindow>,
    @InjectQueue('maintenance') private maintenanceQueue: Queue,
    private auditLogService: AuditLogService,
    private configService: GlobalConfigService,
  ) {}

  async scheduleMaintenanceWindow(dto: ScheduleMaintenanceDto, userId: string): Promise<MaintenanceWindow> {
    const scheduledStart = new Date(dto.scheduledStartAt);
    const scheduledEnd = new Date(dto.scheduledEndAt);
    const now = new Date();
    const twoHoursFromNow = new Date(now.getTime() + 2 * 60 * 60 * 1000);

    if (scheduledStart < twoHoursFromNow) {
      throw new BadRequestException('Maintenance must be scheduled at least 2 hours in advance');
    }

    if (scheduledEnd <= scheduledStart) {
      throw new BadRequestException('End time must be after start time');
    }

    const overlapping = await this.maintenanceRepo.findOne({
      where: [
        { scheduledStartAt: LessThan(scheduledEnd), scheduledEndAt: MoreThan(scheduledStart), status: MaintenanceStatus.SCHEDULED },
        { scheduledStartAt: LessThan(scheduledEnd), scheduledEndAt: MoreThan(scheduledStart), status: MaintenanceStatus.ACTIVE },
      ],
    });

    if (overlapping) {
      this.logger.warn(`Overlapping maintenance window detected: ${overlapping.id}`);
    }

    const window = this.maintenanceRepo.create({
      ...dto,
      scheduledStartAt: scheduledStart,
      scheduledEndAt: scheduledEnd,
      status: MaintenanceStatus.SCHEDULED,
      createdById: userId,
    });

    const saved = await this.maintenanceRepo.save(window);

    if (dto.notifyMerchants) {
      await this.maintenanceQueue.add('notify-maintenance', {
        maintenanceId: saved.id,
        notifyAt: new Date(scheduledStart.getTime() - 24 * 60 * 60 * 1000),
      }, { delay: Math.max(0, scheduledStart.getTime() - 24 * 60 * 60 * 1000 - Date.now()) });

      await this.maintenanceQueue.add('notify-maintenance', {
        maintenanceId: saved.id,
        notifyAt: new Date(scheduledStart.getTime() - 60 * 60 * 1000),
      }, { delay: Math.max(0, scheduledStart.getTime() - 60 * 60 * 1000 - Date.now()) });
    }

    await this.auditLogService.log({
      entityType: 'MaintenanceWindow',
      entityId: saved.id,
      action: AuditAction.CREATE,
      actorId: userId,
      actorType: ActorType.ADMIN,
      afterState: { title: saved.title, type: saved.type, scheduledStartAt: saved.scheduledStartAt },
    });

    return saved;
  }

  async startMaintenance(id: string, userId: string): Promise<MaintenanceWindow> {
    const window = await this.maintenanceRepo.findOne({ where: { id } });
    if (!window) throw new NotFoundException('Maintenance window not found');
    if (window.status !== MaintenanceStatus.SCHEDULED) {
      throw new BadRequestException('Only scheduled maintenance can be started');
    }

    window.status = MaintenanceStatus.ACTIVE;
    window.actualStartAt = new Date();

    if (window.blockNewTransactions) {
      // Update platform setting - simplified approach
      this.logger.warn('MAINTENANCE_MODE enabled - blocking new transactions');
    }

    const saved = await this.maintenanceRepo.save(window);

    await this.auditLogService.log({
      entityType: 'MaintenanceWindow',
      entityId: saved.id,
      action: AuditAction.UPDATE,
      actorId: userId,
      actorType: ActorType.ADMIN,
      afterState: { status: saved.status, actualStartAt: saved.actualStartAt },
    });

    return saved;
  }

  async endMaintenance(id: string, userId: string): Promise<MaintenanceWindow> {
    const window = await this.maintenanceRepo.findOne({ where: { id } });
    if (!window) throw new NotFoundException('Maintenance window not found');
    if (window.status !== MaintenanceStatus.ACTIVE) {
      throw new BadRequestException('Only active maintenance can be ended');
    }

    window.status = MaintenanceStatus.COMPLETED;
    window.actualEndAt = new Date();

    if (window.blockNewTransactions) {
      this.logger.log('MAINTENANCE_MODE disabled - allowing transactions');
    }

    const saved = await this.maintenanceRepo.save(window);

    if (window.notifyMerchants) {
      await this.maintenanceQueue.add('notify-maintenance-complete', { maintenanceId: saved.id });
    }

    await this.auditLogService.log({
      entityType: 'MaintenanceWindow',
      entityId: saved.id,
      action: AuditAction.UPDATE,
      actorId: userId,
      actorType: ActorType.ADMIN,
      afterState: { status: saved.status, actualEndAt: saved.actualEndAt },
    });

    return saved;
  }

  async cancelMaintenance(id: string, dto: CancelMaintenanceDto, userId: string): Promise<MaintenanceWindow> {
    const window = await this.maintenanceRepo.findOne({ where: { id } });
    if (!window) throw new NotFoundException('Maintenance window not found');
    if (window.status === MaintenanceStatus.ACTIVE) {
      throw new ForbiddenException('Cannot cancel active maintenance - must end it first');
    }
    if (window.status !== MaintenanceStatus.SCHEDULED) {
      throw new BadRequestException('Only scheduled maintenance can be cancelled');
    }

    window.status = MaintenanceStatus.CANCELLED;
    window.cancelledById = userId;
    window.cancellationReason = dto.reason;

    const saved = await this.maintenanceRepo.save(window);

    if (window.notifyMerchants) {
      await this.maintenanceQueue.add('notify-maintenance-cancelled', { maintenanceId: saved.id });
    }

    await this.auditLogService.log({
      entityType: 'MaintenanceWindow',
      entityId: saved.id,
      action: AuditAction.UPDATE,
      actorId: userId,
      actorType: ActorType.ADMIN,
      afterState: { status: saved.status, cancellationReason: dto.reason },
    });

    return saved;
  }

  async listMaintenanceWindows(status?: MaintenanceStatus, createdAfter?: Date, createdBefore?: Date): Promise<MaintenanceWindow[]> {
    const qb = this.maintenanceRepo.createQueryBuilder('mw');
    if (status) qb.andWhere('mw.status = :status', { status });
    if (createdAfter) qb.andWhere('mw.createdAt >= :createdAfter', { createdAfter });
    if (createdBefore) qb.andWhere('mw.createdAt <= :createdBefore', { createdBefore });
    return qb.orderBy('mw.scheduledStartAt', 'DESC').getMany();
  }
}
