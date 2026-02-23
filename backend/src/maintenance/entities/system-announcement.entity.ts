import { Entity, Column } from 'typeorm';
import { BaseEntity } from '../../database/entities/base.entity';
import { AnnouncementType, AnnouncementAudience } from '../enums/maintenance.enums';

@Entity('system_announcements')
export class SystemAnnouncement extends BaseEntity {
  @Column()
  title: string;

  @Column({ type: 'text' })
  body: string;

  @Column({ type: 'enum', enum: AnnouncementType })
  type: AnnouncementType;

  @Column({ type: 'enum', enum: AnnouncementAudience })
  audience: AnnouncementAudience;

  @Column({ type: 'jsonb', nullable: true })
  audienceFilter: Record<string, unknown> | null;

  @Column({ type: 'boolean', default: false })
  isPublished: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  publishedAt: Date | null;

  @Column({ nullable: true })
  publishedById: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  expiresAt: Date | null;

  @Column({ type: 'boolean', default: false })
  sendEmail: boolean;

  @Column({ type: 'boolean', default: false })
  emailSent: boolean;

  @Column({ type: 'int', default: 0 })
  emailRecipientsCount: number;
}
