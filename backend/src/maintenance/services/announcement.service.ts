import { Injectable, Logger, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { SystemAnnouncement } from '../entities/system-announcement.entity';
import { AnnouncementType, AnnouncementAudience } from '../enums/maintenance.enums';
import { CreateAnnouncementDto, UpdateAnnouncementDto } from '../dto/announcement.dto';
import { AuditLogService } from '../../audit/audit-log.service';
import { AuditAction, ActorType } from '../../database/entities/audit-log.enums';

@Injectable()
export class AnnouncementService {
  private readonly logger = new Logger(AnnouncementService.name);

  constructor(
    @InjectRepository(SystemAnnouncement)
    private announcementRepo: Repository<SystemAnnouncement>,
    @InjectQueue('announcements') private announcementQueue: Queue,
    private auditLogService: AuditLogService,
  ) {}

  async createAnnouncement(dto: CreateAnnouncementDto, userId: string): Promise<SystemAnnouncement> {
    const announcement = this.announcementRepo.create({
      ...dto,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
    });

    const saved = await this.announcementRepo.save(announcement);

    await this.auditLogService.log({
      entityType: 'SystemAnnouncement',
      entityId: saved.id,
      action: AuditAction.CREATE,
      actorId: userId,
      actorType: ActorType.ADMIN,
      afterState: { title: saved.title, type: saved.type, audience: saved.audience },
    });

    return saved;
  }

  async updateAnnouncement(id: string, dto: UpdateAnnouncementDto, userId: string): Promise<SystemAnnouncement> {
    const announcement = await this.announcementRepo.findOne({ where: { id } });
    if (!announcement) throw new NotFoundException('Announcement not found');
    if (announcement.isPublished) {
      throw new ForbiddenException('Cannot edit published announcement - unpublish first');
    }

    Object.assign(announcement, dto);
    if (dto.expiresAt) announcement.expiresAt = new Date(dto.expiresAt);

    const saved = await this.announcementRepo.save(announcement);

    await this.auditLogService.log({
      entityType: 'SystemAnnouncement',
      entityId: saved.id,
      action: AuditAction.UPDATE,
      actorId: userId,
      actorType: ActorType.ADMIN,
      afterState: dto,
    });

    return saved;
  }

  async publishAnnouncement(id: string, userId: string): Promise<SystemAnnouncement> {
    const announcement = await this.announcementRepo.findOne({ where: { id } });
    if (!announcement) throw new NotFoundException('Announcement not found');
    if (announcement.isPublished) {
      throw new BadRequestException('Announcement already published');
    }

    announcement.isPublished = true;
    announcement.publishedAt = new Date();
    announcement.publishedById = userId;

    if (announcement.sendEmail) {
      const recipients = await this.computeRecipients(announcement);
      announcement.emailRecipientsCount = recipients.length;
      
      await this.announcementQueue.add('send-announcement-emails', {
        announcementId: announcement.id,
        recipients,
      });
    }

    if (announcement.expiresAt) {
      const delay = announcement.expiresAt.getTime() - Date.now();
      if (delay > 0) {
        await this.announcementQueue.add('unpublish-announcement', { announcementId: announcement.id }, { delay });
      }
    }

    const saved = await this.announcementRepo.save(announcement);

    await this.auditLogService.log({
      entityType: 'SystemAnnouncement',
      entityId: saved.id,
      action: AuditAction.UPDATE,
      actorId: userId,
      actorType: ActorType.ADMIN,
      afterState: { isPublished: true, publishedAt: saved.publishedAt },
    });

    return saved;
  }

  async unpublishAnnouncement(id: string, userId: string): Promise<SystemAnnouncement> {
    const announcement = await this.announcementRepo.findOne({ where: { id } });
    if (!announcement) throw new NotFoundException('Announcement not found');

    announcement.isPublished = false;
    const saved = await this.announcementRepo.save(announcement);

    await this.auditLogService.log({
      entityType: 'SystemAnnouncement',
      entityId: saved.id,
      action: AuditAction.UPDATE,
      actorId: userId,
      actorType: ActorType.ADMIN,
      afterState: { isPublished: false },
    });

    return saved;
  }

  async listAnnouncements(type?: AnnouncementType, isPublished?: boolean, audience?: AnnouncementAudience): Promise<SystemAnnouncement[]> {
    const qb = this.announcementRepo.createQueryBuilder('a');
    if (type) qb.andWhere('a.type = :type', { type });
    if (isPublished !== undefined) qb.andWhere('a.isPublished = :isPublished', { isPublished });
    if (audience) qb.andWhere('a.audience = :audience', { audience });
    return qb.orderBy('a.createdAt', 'DESC').getMany();
  }

  async getAnnouncementById(id: string): Promise<SystemAnnouncement> {
    const announcement = await this.announcementRepo.findOne({ where: { id } });
    if (!announcement) throw new NotFoundException('Announcement not found');
    return announcement;
  }

  async previewRecipients(id: string): Promise<{ count: number; sample: string[] }> {
    const announcement = await this.announcementRepo.findOne({ where: { id } });
    if (!announcement) throw new NotFoundException('Announcement not found');

    const recipients = await this.computeRecipients(announcement);
    return {
      count: recipients.length,
      sample: recipients.slice(0, 10),
    };
  }

  private async computeRecipients(announcement: SystemAnnouncement): Promise<string[]> {
    // Simplified - in production, query merchant database based on audience filter
    const recipients: string[] = [];
    
    if (announcement.audience === AnnouncementAudience.ALL_MERCHANTS) {
      // Query all merchants
      recipients.push('merchant1@example.com', 'merchant2@example.com');
    } else if (announcement.audience === AnnouncementAudience.SPECIFIC_MERCHANTS && announcement.audienceFilter?.merchantIds) {
      // Query specific merchants
      const merchantIds = announcement.audienceFilter.merchantIds as string[];
      recipients.push(...merchantIds.map(id => `merchant-${id}@example.com`));
    }

    return recipients;
  }
}
