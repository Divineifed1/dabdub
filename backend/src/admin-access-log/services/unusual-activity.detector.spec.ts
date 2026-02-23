import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SelectQueryBuilder } from 'typeorm';
import { AdminAccessLog } from '../entities/admin-access-log.entity';
import { UnusualActivityDetector } from '../services/unusual-activity.detector';

const ADMIN_ID = 'admin-uuid-001';

function buildQb(raw: any[]) {
  return {
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    getRawMany: jest.fn().mockResolvedValue(raw),
    getRawOne: jest.fn().mockResolvedValue(raw[0] ?? null),
  } as unknown as SelectQueryBuilder<AdminAccessLog>;
}

describe('UnusualActivityDetector', () => {
  let detector: UnusualActivityDetector;
  let repoQueryMock: jest.Mock;
  let repoQbMock: jest.Mock;

  beforeEach(async () => {
    repoQueryMock = jest.fn();
    repoQbMock = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UnusualActivityDetector,
        {
          provide: getRepositoryToken(AdminAccessLog),
          useValue: {
            createQueryBuilder: repoQbMock,
            query: repoQueryMock,
          },
        },
      ],
    }).compile();

    detector = module.get<UnusualActivityDetector>(UnusualActivityDetector);
  });

  // ── AFTER_HOURS_ACCESS ──────────────────────────────────────────────────────

  describe('AFTER_HOURS_ACCESS', () => {
    it('returns flag when after-hours count exceeds threshold', async () => {
      // Mock the after-hours raw query to return 45 accesses
      repoQbMock.mockReturnValue(buildQb([{ cnt: '45' }]));
      // Other detectors return empty/null via raw query mock
      repoQueryMock.mockResolvedValue([]);

      const flags = await detector.detect(ADMIN_ID, new Date('2026-01-01'));

      expect(flags.some((f) => f.type === 'AFTER_HOURS_ACCESS')).toBe(true);
      expect(
        flags.find((f) => f.type === 'AFTER_HOURS_ACCESS')?.description,
      ).toContain('45');
    });

    it('does NOT flag when after-hours count is below threshold', async () => {
      repoQbMock.mockReturnValue(buildQb([{ cnt: '5' }]));
      repoQueryMock.mockResolvedValue([]);

      const flags = await detector.detect(ADMIN_ID, new Date('2026-01-01'));

      expect(flags.some((f) => f.type === 'AFTER_HOURS_ACCESS')).toBe(false);
    });
  });

  // ── BULK_MERCHANT_ACCESS ────────────────────────────────────────────────────

  describe('BULK_MERCHANT_ACCESS', () => {
    it('returns flag when bulk merchant access is detected', async () => {
      // After-hours: return 0 count so it doesn't trigger
      repoQbMock.mockReturnValue(buildQb([{ cnt: '0' }]));

      // bulk_merchant query returns a row
      repoQueryMock
        .mockResolvedValueOnce([
          { window_start: '2026-01-01T14:00:00Z', distinct_merchants: '142' },
        ]) // bulk merchant
        .mockResolvedValue([]); // other raw queries

      const flags = await detector.detect(ADMIN_ID, new Date('2026-01-01'));

      expect(flags.some((f) => f.type === 'BULK_MERCHANT_ACCESS')).toBe(true);
      expect(
        flags.find((f) => f.type === 'BULK_MERCHANT_ACCESS')?.description,
      ).toContain('142');
    });

    it('does NOT flag for fewer than 100 distinct merchants', async () => {
      repoQbMock.mockReturnValue(buildQb([{ cnt: '0' }]));
      repoQueryMock.mockResolvedValue([]);

      const flags = await detector.detect(ADMIN_ID, new Date('2026-01-01'));

      expect(flags.some((f) => f.type === 'BULK_MERCHANT_ACCESS')).toBe(false);
    });
  });

  // ── HIGH_VELOCITY_ACCESS ────────────────────────────────────────────────────

  describe('HIGH_VELOCITY_ACCESS', () => {
    it('returns flag when > 500 requests in 10 minutes', async () => {
      repoQbMock.mockReturnValue(buildQb([{ cnt: '0' }]));

      repoQueryMock
        .mockResolvedValueOnce([]) // bulk merchant
        .mockResolvedValueOnce([
          { window_start: '2026-01-01T10:00:00Z', req_count: '612' },
        ]) // high velocity
        .mockResolvedValue([]); // ip change

      const flags = await detector.detect(ADMIN_ID, new Date('2026-01-01'));

      expect(flags.some((f) => f.type === 'HIGH_VELOCITY_ACCESS')).toBe(true);
      expect(
        flags.find((f) => f.type === 'HIGH_VELOCITY_ACCESS')?.description,
      ).toContain('612');
    });

    it('does NOT flag when request rate is normal', async () => {
      repoQbMock.mockReturnValue(buildQb([{ cnt: '0' }]));
      repoQueryMock.mockResolvedValue([]);

      const flags = await detector.detect(ADMIN_ID, new Date('2026-01-01'));

      expect(flags.some((f) => f.type === 'HIGH_VELOCITY_ACCESS')).toBe(false);
    });
  });

  // ── IP_CHANGE_WITHIN_SESSION ────────────────────────────────────────────────

  describe('IP_CHANGE_WITHIN_SESSION', () => {
    it('returns flag when session IPs change within window', async () => {
      repoQbMock.mockReturnValue(buildQb([{ cnt: '0' }]));

      repoQueryMock
        .mockResolvedValueOnce([]) // bulk merchant
        .mockResolvedValueOnce([]) // high velocity
        .mockResolvedValueOnce([
          {
            session_id: 'session-abc',
            ip1: '192.168.1.10',
            ip2: '10.0.0.5',
          },
        ]); // ip change

      const flags = await detector.detect(ADMIN_ID, new Date('2026-01-01'));

      expect(flags.some((f) => f.type === 'IP_CHANGE_WITHIN_SESSION')).toBe(
        true,
      );
      const flag = flags.find((f) => f.type === 'IP_CHANGE_WITHIN_SESSION');
      expect(flag?.description).toContain('192.168.1.10');
      expect(flag?.description).toContain('10.0.0.5');
    });

    it('does NOT flag when IPs are consistent within session', async () => {
      repoQbMock.mockReturnValue(buildQb([{ cnt: '0' }]));
      repoQueryMock.mockResolvedValue([]);

      const flags = await detector.detect(ADMIN_ID, new Date('2026-01-01'));

      expect(flags.some((f) => f.type === 'IP_CHANGE_WITHIN_SESSION')).toBe(
        false,
      );
    });
  });

  // ── Multiple flags simultaneously ──────────────────────────────────────────

  it('can return multiple flags at once', async () => {
    repoQbMock.mockReturnValue(buildQb([{ cnt: '50' }])); // after hours triggers

    repoQueryMock
      .mockResolvedValueOnce([
        { window_start: '2026-01-01T14:00:00Z', distinct_merchants: '150' },
      ])
      .mockResolvedValueOnce([
        { window_start: '2026-01-01T10:00:00Z', req_count: '700' },
      ])
      .mockResolvedValueOnce([
        { session_id: 'sess', ip1: '1.1.1.1', ip2: '2.2.2.2' },
      ]);

    const flags = await detector.detect(ADMIN_ID, new Date('2026-01-01'));

    expect(flags.length).toBe(4);
    const types = flags.map((f) => f.type);
    expect(types).toContain('AFTER_HOURS_ACCESS');
    expect(types).toContain('BULK_MERCHANT_ACCESS');
    expect(types).toContain('HIGH_VELOCITY_ACCESS');
    expect(types).toContain('IP_CHANGE_WITHIN_SESSION');
  });

  // ── Detector resilience ─────────────────────────────────────────────────────

  it('does not throw if an individual detector fails', async () => {
    repoQbMock.mockReturnValue(buildQb([{ cnt: '0' }]));
    repoQueryMock.mockRejectedValue(new Error('DB error'));

    // Should resolve without throwing, returning whatever succeeded
    await expect(
      detector.detect(ADMIN_ID, new Date('2026-01-01')),
    ).resolves.not.toThrow();
  });
});
