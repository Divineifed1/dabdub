import { Processor, Process } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SystemAnnouncement } from '../entities/system-announcement.entity';

@Processor('announcements')
export class AnnouncementProcessor {
  private readonly logger = new Logger(AnnouncementProcessor.name);

  constructor(
    @InjectRepository(SystemAnnouncement)
    private announcementRepo: Repository<SystemAnnouncement>,
  ) {}

  @Process('send-announcement-emails')
  async handleAnnouncementEmails(job: Job<{ announcementId: string; recipients: string[] }>) {
    const { announcementId, recipients } = job.data;
    const announcement = await this.announcementRepo.findOne({ where: { id: announcementId } });
    
    if (!announcement) {
      this.logger.warn(`Announcement ${announcementId} not found`);
      return;
    }

    this.logger.log(`Sending announcement emails to ${recipients.length} recipients: ${announcement.title}`);
    
    // Email sending logic would go here
    announcement.emailSent = true;
    await this.announcementRepo.save(announcement);

    return { sent: true, count: recipients.length };
  }

  @Process('unpublish-announcement')
  async handleUnpublishAnnouncement(job: Job<{ announcementId: string }>) {
    const { announcementId } = job.data;
    const announcement = await this.announcementRepo.findOne({ where: { id: announcementId } });
    
    if (!announcement) {
      this.logger.warn(`Announcement ${announcementId} not found`);
      return;
    }

    if (announcement.isPublished) {
      announcement.isPublished = false;
      await this.announcementRepo.save(announcement);
      this.logger.log(`Auto-unpublished expired announcement: ${announcement.title}`);
    }

    return { unpublished: true, announcementId };
  }
}
