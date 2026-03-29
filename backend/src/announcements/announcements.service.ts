import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  In,
  LessThanOrEqual,
  MoreThanOrEqual,
  Repository,
} from 'typeorm';
import { Role } from '../rbac/rbac.types';
import { TierName } from '../tier-config/entities/tier-config.entity';
import { User, KycStatus } from '../users/entities/user.entity';
import { CheeseGateway, WS_EVENTS } from '../ws/cheese.gateway';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { UpdateAnnouncementDto } from './dto/update-announcement.dto';
import { AnnouncementDismissal } from './entities/announcement-dismissal.entity';
import {
  Announcement,
  AnnouncementTargetAudience,
  AnnouncementType,
} from './entities/announcement.entity';

const TYPE_PRIORITY: Record<AnnouncementType, number> = {
  [AnnouncementType.CRITICAL]: 0,
  [AnnouncementType.WARNING]: 1,
  [AnnouncementType.INFO]: 2,
  [AnnouncementType.PROMO]: 3,
};

export type AnnouncementWithStats = Announcement & { dismissalCount: number };

@Injectable()
export class AnnouncementsService {
  constructor(
    @InjectRepository(Announcement)
    private readonly announcementRepo: Repository<Announcement>,

    @InjectRepository(AnnouncementDismissal)
    private readonly dismissalRepo: Repository<AnnouncementDismissal>,

    @InjectRepository(User)
    private readonly userRepo: Repository<User>,

    private readonly gateway: CheeseGateway,
  ) {}

  async getActiveForUser(userId: string): Promise<Announcement[]> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const now = new Date();
    const activeAnnouncements = await this.announcementRepo.find({
      where: {
        isActive: true,
        showFrom: LessThanOrEqual(now),
        showUntil: MoreThanOrEqual(now),
      },
      order: {
        createdAt: 'DESC',
      },
    });

    const audienceMatched = activeAnnouncements.filter((announcement) =>
      this.matchesAudience(user, announcement.targetAudience),
    );

    if (audienceMatched.length === 0) {
      return [];
    }

    const dismissals = await this.dismissalRepo.find({
      where: {
        userId,
        announcementId: In(
          audienceMatched.map((announcement) => announcement.id),
        ),
      },
    });
    const dismissedIds = new Set(
      dismissals.map((dismissal) => dismissal.announcementId),
    );

    return audienceMatched
      .filter((announcement) => {
        if (announcement.type === AnnouncementType.CRITICAL) {
          return true;
        }

        return !dismissedIds.has(announcement.id);
      })
      .sort((left, right) => {
        const byType = TYPE_PRIORITY[left.type] - TYPE_PRIORITY[right.type];
        if (byType !== 0) {
          return byType;
        }

        return right.showFrom.getTime() - left.showFrom.getTime();
      });
  }

  async dismiss(userId: string, announcementId: string): Promise<void> {
    const announcement = await this.announcementRepo.findOne({
      where: { id: announcementId, isActive: true },
    });

    if (!announcement) {
      throw new NotFoundException('Announcement not found');
    }

    if (
      announcement.type === AnnouncementType.CRITICAL ||
      !announcement.isDismissible
    ) {
      throw new BadRequestException('Announcement cannot be dismissed');
    }

    const existing = await this.dismissalRepo.findOne({
      where: { userId, announcementId },
    });

    if (existing) {
      return;
    }

    await this.dismissalRepo.save(
      this.dismissalRepo.create({
        userId,
        announcementId,
      }),
    );
  }

  async create(
    adminId: string,
    dto: CreateAnnouncementDto,
  ): Promise<Announcement> {
    const dates = this.resolveDates(dto.showFrom, dto.showUntil);
    const announcement = this.announcementRepo.create({
      title: dto.title,
      body: dto.body,
      type: dto.type,
      targetAudience: dto.targetAudience,
      ctaLabel: dto.ctaLabel ?? null,
      ctaUrl: dto.ctaUrl ?? null,
      isDismissible:
        dto.type === AnnouncementType.CRITICAL ? false : dto.isDismissible,
      showFrom: dates.showFrom,
      showUntil: dates.showUntil,
      createdBy: adminId,
      isActive: true,
    });

    const saved = await this.announcementRepo.save(announcement);

    if (saved.type === AnnouncementType.CRITICAL) {
      await this.gateway.emitToAll(WS_EVENTS.SYSTEM_ANNOUNCEMENT, saved);
    }

    return saved;
  }

  async getAllWithStats(): Promise<AnnouncementWithStats[]> {
    const { entities, raw } = await this.announcementRepo
      .createQueryBuilder('announcement')
      .leftJoin(
        AnnouncementDismissal,
        'dismissal',
        'dismissal.announcement_id = announcement.id',
      )
      .addSelect('COUNT(dismissal.id)', 'dismissalCount')
      .groupBy('announcement.id')
      .orderBy('announcement.createdAt', 'DESC')
      .getRawAndEntities();

    return entities.map((announcement, index) => ({
      ...announcement,
      dismissalCount: Number(raw[index]?.dismissalCount ?? 0),
    }));
  }

  async update(id: string, dto: UpdateAnnouncementDto): Promise<Announcement> {
    const announcement = await this.announcementRepo.findOne({ where: { id } });
    if (!announcement) {
      throw new NotFoundException('Announcement not found');
    }

    const showFrom = dto.showFrom ?? announcement.showFrom.toISOString();
    const showUntil = dto.showUntil ?? announcement.showUntil.toISOString();
    const dates = this.resolveDates(showFrom, showUntil);
    const nextType = dto.type ?? announcement.type;

    Object.assign(announcement, {
      title: dto.title ?? announcement.title,
      body: dto.body ?? announcement.body,
      type: nextType,
      targetAudience: dto.targetAudience ?? announcement.targetAudience,
      ctaLabel:
        dto.ctaLabel === undefined ? announcement.ctaLabel : dto.ctaLabel,
      ctaUrl: dto.ctaUrl === undefined ? announcement.ctaUrl : dto.ctaUrl,
      isDismissible:
        nextType === AnnouncementType.CRITICAL
          ? false
          : dto.isDismissible ?? announcement.isDismissible,
      showFrom: dates.showFrom,
      showUntil: dates.showUntil,
    });

    return this.announcementRepo.save(announcement);
  }

  async deactivate(id: string): Promise<Announcement> {
    const announcement = await this.announcementRepo.findOne({ where: { id } });
    if (!announcement) {
      throw new NotFoundException('Announcement not found');
    }

    announcement.isActive = false;
    return this.announcementRepo.save(announcement);
  }

  private resolveDates(
    showFrom: string,
    showUntil: string,
  ): { showFrom: Date; showUntil: Date } {
    const resolved = {
      showFrom: new Date(showFrom),
      showUntil: new Date(showUntil),
    };

    if (
      Number.isNaN(resolved.showFrom.getTime()) ||
      Number.isNaN(resolved.showUntil.getTime())
    ) {
      throw new BadRequestException('Invalid announcement schedule');
    }

    if (resolved.showUntil <= resolved.showFrom) {
      throw new BadRequestException('showUntil must be after showFrom');
    }

    return resolved;
  }

  private matchesAudience(
    user: User,
    targetAudience: AnnouncementTargetAudience,
  ): boolean {
    switch (targetAudience) {
      case AnnouncementTargetAudience.ALL:
        return true;
      case AnnouncementTargetAudience.SILVER:
        return user.tier === TierName.SILVER;
      case AnnouncementTargetAudience.GOLD:
        return user.tier === TierName.GOLD;
      case AnnouncementTargetAudience.BLACK:
        return user.tier === TierName.BLACK;
      case AnnouncementTargetAudience.MERCHANTS:
        return user.role === Role.Merchant || user.isMerchant;
      case AnnouncementTargetAudience.UNVERIFIED:
        return user.kycStatus !== KycStatus.APPROVED;
      default:
        return false;
    }
  }
}
