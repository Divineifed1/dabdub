import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { Role } from '../rbac/rbac.types';
import { TierName } from '../tier-config/entities/tier-config.entity';
import { User, KycStatus } from '../users/entities/user.entity';
import { CheeseGateway } from '../ws/cheese.gateway';
import { AnnouncementsService } from './announcements.service';
import { AnnouncementDismissal } from './entities/announcement-dismissal.entity';
import {
  Announcement,
  AnnouncementTargetAudience,
  AnnouncementType,
} from './entities/announcement.entity';

describe('AnnouncementsService', () => {
  let service: AnnouncementsService;
  let announcementRepo: jest.Mocked<
    Pick<
      Repository<Announcement>,
      'find' | 'findOne' | 'create' | 'save' | 'createQueryBuilder'
    >
  >;
  let dismissalRepo: jest.Mocked<
    Pick<Repository<AnnouncementDismissal>, 'find' | 'findOne' | 'create' | 'save'>
  >;
  let userRepo: jest.Mocked<Pick<Repository<User>, 'findOne'>>;

  const gateway = {
    emitToAll: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    announcementRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      createQueryBuilder: jest.fn(),
    } as any;

    dismissalRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    } as any;

    userRepo = {
      findOne: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnnouncementsService,
        { provide: getRepositoryToken(Announcement), useValue: announcementRepo },
        {
          provide: getRepositoryToken(AnnouncementDismissal),
          useValue: dismissalRepo,
        },
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: CheeseGateway, useValue: gateway },
      ],
    }).compile();

    service = module.get(AnnouncementsService);
  });

  it('critical announcement is not dismissible', async () => {
    announcementRepo.findOne.mockResolvedValue({
      id: 'ann-critical',
      isActive: true,
      type: AnnouncementType.CRITICAL,
      isDismissible: false,
    } as Announcement);

    await expect(service.dismiss('user-1', 'ann-critical')).rejects.toThrow(
      'Announcement cannot be dismissed',
    );
    expect(dismissalRepo.save).not.toHaveBeenCalled();
  });

  it('targetAudience=gold filters out Silver users', async () => {
    userRepo.findOne.mockResolvedValue({
      id: 'user-1',
      tier: TierName.SILVER,
      role: Role.User,
      isMerchant: false,
      kycStatus: KycStatus.APPROVED,
    } as User);
    announcementRepo.find.mockResolvedValue([
      makeAnnouncement({
        id: 'gold-only',
        targetAudience: AnnouncementTargetAudience.GOLD,
      }),
      makeAnnouncement({
        id: 'all-users',
        targetAudience: AnnouncementTargetAudience.ALL,
      }),
    ]);
    dismissalRepo.find.mockResolvedValue([]);

    const result = await service.getActiveForUser('user-1');

    expect(result.map((announcement) => announcement.id)).toEqual(['all-users']);
  });

  it('dismissed announcement is not returned', async () => {
    userRepo.findOne.mockResolvedValue({
      id: 'user-1',
      tier: TierName.GOLD,
      role: Role.User,
      isMerchant: false,
      kycStatus: KycStatus.APPROVED,
    } as User);
    announcementRepo.find.mockResolvedValue([
      makeAnnouncement({
        id: 'dismissed',
        targetAudience: AnnouncementTargetAudience.ALL,
        type: AnnouncementType.INFO,
      }),
      makeAnnouncement({
        id: 'critical-stays',
        targetAudience: AnnouncementTargetAudience.ALL,
        type: AnnouncementType.CRITICAL,
        isDismissible: false,
      }),
    ]);
    dismissalRepo.find.mockResolvedValue([
      {
        id: 'dismissal-1',
        userId: 'user-1',
        announcementId: 'dismissed',
      } as AnnouncementDismissal,
    ]);

    const result = await service.getActiveForUser('user-1');

    expect(result.map((announcement) => announcement.id)).toEqual([
      'critical-stays',
    ]);
  });

  it('fires websocket event on critical creation', async () => {
    const savedAnnouncement = makeAnnouncement({
      id: 'critical-1',
      type: AnnouncementType.CRITICAL,
      isDismissible: false,
    });
    announcementRepo.create.mockReturnValue(savedAnnouncement);
    announcementRepo.save.mockResolvedValue(savedAnnouncement);

    await service.create('admin-1', {
      title: 'Maintenance',
      body: 'We are performing emergency maintenance',
      type: AnnouncementType.CRITICAL,
      targetAudience: AnnouncementTargetAudience.ALL,
      isDismissible: true,
      showFrom: '2026-03-28T10:00:00.000Z',
      showUntil: '2026-03-29T10:00:00.000Z',
    });

    expect(announcementRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        createdBy: 'admin-1',
        isDismissible: false,
        type: AnnouncementType.CRITICAL,
      }),
    );
    expect(gateway.emitToAll).toHaveBeenCalledWith(
      'system_announcement',
      savedAnnouncement,
    );
  });
});

function makeAnnouncement(overrides: Partial<Announcement> = {}): Announcement {
  return {
    id: 'announcement-1',
    title: 'Title',
    body: 'Body',
    type: AnnouncementType.INFO,
    targetAudience: AnnouncementTargetAudience.ALL,
    ctaLabel: null,
    ctaUrl: null,
    isDismissible: true,
    showFrom: new Date('2026-03-27T00:00:00.000Z'),
    showUntil: new Date('2026-03-30T00:00:00.000Z'),
    createdBy: 'admin-1',
    isActive: true,
    createdAt: new Date('2026-03-27T00:00:00.000Z'),
    updatedAt: new Date('2026-03-27T00:00:00.000Z'),
    dismissals: [],
    ...overrides,
  } as Announcement;
}
