import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AdminAccessLog } from '../entities/admin-access-log.entity';
import { UnusualActivityDto } from '../dto/admin-access-log.dto';

const AFTER_HOURS_START = 20; // 20:00 UTC
const AFTER_HOURS_END = 8; // 08:00 UTC
const AFTER_HOURS_MIN_COUNT = 10;

const BULK_MERCHANT_THRESHOLD = 100; // distinct merchants in 1 hour
const HIGH_VELOCITY_THRESHOLD = 500; // requests in 10 minutes
const IP_CHANGE_WINDOW_MINUTES = 5;

@Injectable()
export class UnusualActivityDetector {
  private readonly logger = new Logger(UnusualActivityDetector.name);

  constructor(
    @InjectRepository(AdminAccessLog)
    private readonly repo: Repository<AdminAccessLog>,
  ) {}

  async detect(adminId: string, since: Date): Promise<UnusualActivityDto[]> {
    const flags: UnusualActivityDto[] = [];

    // Run all detectors concurrently — async, never awaited by the API layer
    const [afterHours, bulk, velocity, ipChange] = await Promise.allSettled([
      this.detectAfterHours(adminId, since),
      this.detectBulkMerchantAccess(adminId, since),
      this.detectHighVelocity(adminId, since),
      this.detectIpChange(adminId, since),
    ]);

    for (const result of [afterHours, bulk, velocity, ipChange]) {
      if (result.status === 'fulfilled' && result.value) {
        flags.push(result.value);
      } else if (result.status === 'rejected') {
        this.logger.warn('Unusual-activity detector threw', result.reason);
      }
    }

    return flags;
  }

  // ── Individual detectors ───────────────────────────────────────────────────

  private async detectAfterHours(
    adminId: string,
    since: Date,
  ): Promise<UnusualActivityDto | null> {
    // Count requests made between 20:00 and 08:00 UTC
    const result: Array<{ cnt: string }> = await this.repo
      .createQueryBuilder('l')
      .select('COUNT(*)', 'cnt')
      .where('l.adminId = :adminId', { adminId })
      .andWhere('l.createdAt >= :since', { since })
      .andWhere(
        `(EXTRACT(HOUR FROM l.createdAt AT TIME ZONE 'UTC') >= :startH OR EXTRACT(HOUR FROM l.createdAt AT TIME ZONE 'UTC') < :endH)`,
        { startH: AFTER_HOURS_START, endH: AFTER_HOURS_END },
      )
      .getRawMany();

    const count = parseInt(result[0]?.cnt ?? '0', 10);
    if (count < AFTER_HOURS_MIN_COUNT) return null;

    return {
      type: 'AFTER_HOURS_ACCESS',
      description: `Accessed ${count} resources outside 08:00-20:00 UTC`,
    };
  }

  private async detectBulkMerchantAccess(
    adminId: string,
    since: Date,
  ): Promise<UnusualActivityDto | null> {
    // Find any 1-hour window where > 100 distinct merchants were accessed
    const result: Array<{ window_start: Date; distinct_merchants: string }> =
      await this.repo.query(
        `
        SELECT
          date_trunc('hour', created_at) AS window_start,
          COUNT(DISTINCT resource_id)    AS distinct_merchants
        FROM admin_access_logs
        WHERE admin_id    = $1
          AND created_at >= $2
          AND resource_type = 'Merchant'
          AND resource_id IS NOT NULL
        GROUP BY 1
        HAVING COUNT(DISTINCT resource_id) > $3
        LIMIT 1
        `,
        [adminId, since, BULK_MERCHANT_THRESHOLD],
      );

    if (!result.length) return null;

    return {
      type: 'BULK_MERCHANT_ACCESS',
      description: `Accessed ${result[0].distinct_merchants} distinct merchants within a 1-hour window`,
    };
  }

  private async detectHighVelocity(
    adminId: string,
    since: Date,
  ): Promise<UnusualActivityDto | null> {
    // Find any 10-minute window exceeding the threshold
    const result: Array<{ window_start: Date; req_count: string }> =
      await this.repo.query(
        `
        SELECT
          date_trunc('minute', created_at - (EXTRACT(MINUTE FROM created_at)::int % 10) * interval '1 minute') AS window_start,
          COUNT(*) AS req_count
        FROM admin_access_logs
        WHERE admin_id    = $1
          AND created_at >= $2
        GROUP BY 1
        HAVING COUNT(*) > $3
        ORDER BY req_count DESC
        LIMIT 1
        `,
        [adminId, since, HIGH_VELOCITY_THRESHOLD],
      );

    if (!result.length) return null;

    return {
      type: 'HIGH_VELOCITY_ACCESS',
      description: `${result[0].req_count} requests in a 10-minute window (threshold: ${HIGH_VELOCITY_THRESHOLD})`,
    };
  }

  private async detectIpChange(
    adminId: string,
    since: Date,
  ): Promise<UnusualActivityDto | null> {
    // Find pairs of consecutive requests in the same session from different IPs
    // within IP_CHANGE_WINDOW_MINUTES minutes of each other
    const result: Array<{ session_id: string; ip1: string; ip2: string }> =
      await this.repo.query(
        `
        WITH ordered AS (
          SELECT
            session_id,
            ip_address,
            created_at,
            LAG(ip_address) OVER (PARTITION BY session_id ORDER BY created_at) AS prev_ip,
            LAG(created_at) OVER (PARTITION BY session_id ORDER BY created_at) AS prev_at
          FROM admin_access_logs
          WHERE admin_id   = $1
            AND created_at >= $2
        )
        SELECT session_id, prev_ip AS ip1, ip_address AS ip2
        FROM ordered
        WHERE prev_ip IS NOT NULL
          AND prev_ip <> ip_address
          AND EXTRACT(EPOCH FROM (created_at - prev_at)) / 60 <= $3
        LIMIT 1
        `,
        [adminId, since, IP_CHANGE_WINDOW_MINUTES],
      );

    if (!result.length) return null;

    return {
      type: 'IP_CHANGE_WITHIN_SESSION',
      description: `Session ${result[0].session_id} had requests from ${result[0].ip1} and ${result[0].ip2} within ${IP_CHANGE_WINDOW_MINUTES} minutes`,
    };
  }
}
