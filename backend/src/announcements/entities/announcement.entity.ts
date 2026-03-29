import { Column, Entity, Index, OneToMany } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { AnnouncementDismissal } from './announcement-dismissal.entity';

export enum AnnouncementType {
  INFO = 'info',
  WARNING = 'warning',
  CRITICAL = 'critical',
  PROMO = 'promo',
}

export enum AnnouncementTargetAudience {
  ALL = 'all',
  SILVER = 'silver',
  GOLD = 'gold',
  BLACK = 'black',
  MERCHANTS = 'merchants',
  UNVERIFIED = 'unverified',
}

@Entity('announcements')
@Index(['isActive', 'showFrom', 'showUntil'])
export class Announcement extends BaseEntity {
  @Column({ type: 'varchar', length: 100 })
  title!: string;

  @Column({ type: 'text' })
  body!: string;

  @Column({ type: 'enum', enum: AnnouncementType })
  type!: AnnouncementType;

  @Column({
    name: 'target_audience',
    type: 'enum',
    enum: AnnouncementTargetAudience,
    default: AnnouncementTargetAudience.ALL,
  })
  targetAudience!: AnnouncementTargetAudience;

  @Column({ name: 'cta_label', type: 'varchar', length: 50, nullable: true })
  ctaLabel!: string | null;

  @Column({ name: 'cta_url', type: 'varchar', nullable: true })
  ctaUrl!: string | null;

  @Column({ name: 'is_dismissible', default: true })
  isDismissible!: boolean;

  @Column({ name: 'show_from', type: 'timestamptz' })
  showFrom!: Date;

  @Column({ name: 'show_until', type: 'timestamptz' })
  showUntil!: Date;

  @Column({ name: 'created_by', type: 'uuid' })
  createdBy!: string;

  @Column({ name: 'is_active', default: true })
  isActive!: boolean;

  @OneToMany(() => AnnouncementDismissal, (dismissal) => dismissal.announcement)
  dismissals!: AnnouncementDismissal[];
}
