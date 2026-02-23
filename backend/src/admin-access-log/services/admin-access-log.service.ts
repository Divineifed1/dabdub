import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AdminAccessLog } from '../entities/admin-access-log.entity';
import {
  AccessLogQueryDto,
  AccessLogPageDto,
  AccessSummaryDto,
  AccessSummaryQueryDto,
  ActivityReportDto,
  AdminSummaryRowDto,
  SessionHistoryDto,
} from '../dto/admin-access-log.dto';
import { UnusualActivityDetector } from './unusual-activity.detector';
import { RedisService } from '../../common/redis/redis.service';
import { CacheService } from '../../cache/cache.service';
import { AuditLogService } from '../../audit/audit-log.service';
import {
  ActorType,
  AuditAction,
} from '../../database/entities/audit-log.enums';
import { UserEntity, UserRole } from '../../database/entities/user.entity';

const SUMMARY_CACHE_TTL = 5 * 60; // 5 minutes
const PERIOD_DAYS: Record<string, number> = { '7d': 7, '30d': 30, '90d': 90 };

interface RecordPayload {
  adminId: string;
  sessionId: string;
  method: string;
  path: string;
  resourceType: string;
  resourceId: string | null;
  statusCode: number;
  durationMs: number;
  ipAddress: string;
  correlationId: string;
}

@Injectable()
export class AdminAccessLogService {
  private readonly logger = new Logger(AdminAccessLogService.name);

  constructor(
    @InjectRepository(AdminAccessLog)
    private readonly repo: Repository<AdminAccessLog>,
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    private readonly detector: UnusualActivityDetector,
    private readonly redis: RedisService,
    private readonly cache: CacheService,
    private readonly audit: AuditLogService,
  ) {}

  // ─── Write path (middleware calls this) ────────────────────────────────────

  /**
   * Fire-and-forget insert. Uses a raw query builder insert to skip ORM
   * overhead and avoid transactions (append-only, write-optimised).
   */
  async record(payload: RecordPayload): Promise<void> {
    try {
      await this.repo
        .createQueryBuilder()
        .insert()
        .into(AdminAccessLog)
        .values({
          adminId: payload.adminId,
          sessionId: payload.sessionId,
          method: payload.method,
          path: payload.path.substring(0, 500),
          resourceType: payload.resourceType,
          resourceId: payload.resourceId,
          statusCode: payload.statusCode,
          durationMs: payload.durationMs,
          ipAddress: payload.ipAddress.substring(0, 100),
          correlationId: payload.correlationId.substring(0, 100),
        })
        .execute();
    } catch (err) {
      // Must never throw — writing a log must not break the request
      this.logger.error('Failed to write admin access log', err);
    }
  }

  // ─── Read: paginated access history ────────────────────────────────────────

  async getAccessLog(
    adminId: string,
    query: AccessLogQueryDto,
  ): Promise<AccessLogPageDto> {
    await this.assertAdminExists(adminId);

    const page = query.page ?? 1;
    const limit = query.limit ?? 50;

    const qb = this.repo
      .createQueryBuilder('l')
      .where('l.adminId = :adminId', { adminId })
      .orderBy('l.createdAt', 'DESC')
      .take(limit)
      .skip((page - 1) * limit);

    if (query.startDate) {
      qb.andWhere('l.createdAt >= :start', {
        start: new Date(query.startDate),
      });
    }
    if (query.endDate) {
      qb.andWhere('l.createdAt <= :end', { end: new Date(query.endDate) });
    }
    if (query.method) {
      qb.andWhere('l.method = :method', { method: query.method });
    }
    if (query.resourceType) {
      qb.andWhere('l.resourceType = :resourceType', {
        resourceType: query.resourceType,
      });
    }

    const [data, total] = await qb.getManyAndCount();

    return { data, meta: { total, page, limit } };
  }

  // ─── Read: access summary (cached 5 min) ───────────────────────────────────

  async getAccessSummary(
    adminId: string,
    query: AccessSummaryQueryDto,
  ): Promise<AccessSummaryDto> {
    await this.assertAdminExists(adminId);

    const period = query.period ?? '30d';
    const cacheKey = `admin_access_summary:${adminId}:${period}`;

    const cached = await this.redis.get<AccessSummaryDto>(cacheKey);
    if (cached) return cached;

    const since = this.periodToDate(period);
    const summary = await this.buildSummary(adminId, since, period);

    // Cache for 5 minutes — expensive aggregation
    await this.redis.set(cacheKey, summary, SUMMARY_CACHE_TTL);
    return summary;
  }

  private async buildSummary(
    adminId: string,
    since: Date,
    period: string,
  ): Promise<AccessSummaryDto> {
    const [
      totalResult,
      uniqueIpsResult,
      byDayResult,
      topResourcesResult,
      unusualActivity,
    ] = await Promise.all([
      // Total request count
      this.repo
        .createQueryBuilder('l')
        .select('COUNT(*)', 'total')
        .where('l.adminId = :adminId', { adminId })
        .andWhere('l.createdAt >= :since', { since })
        .getRawOne<{ total: string }>(),

      // Unique IPs
      this.repo
        .createQueryBuilder('l')
        .select('COUNT(DISTINCT l.ipAddress)', 'count')
        .where('l.adminId = :adminId', { adminId })
        .andWhere('l.createdAt >= :since', { since })
        .getRawOne<{ count: string }>(),

      // Requests by calendar day
      this.repo.query(
        `SELECT to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS date,
                COUNT(*) AS count
         FROM admin_access_logs
         WHERE admin_id = $1 AND created_at >= $2
         GROUP BY 1 ORDER BY 1`,
        [adminId, since],
      ) as Promise<Array<{ date: string; count: string }>>,

      // Top accessed resource types
      this.repo
        .createQueryBuilder('l')
        .select('l.resourceType', 'resourceType')
        .addSelect('COUNT(*)', 'count')
        .where('l.adminId = :adminId', { adminId })
        .andWhere('l.createdAt >= :since', { since })
        .groupBy('l.resourceType')
        .orderBy('count', 'DESC')
        .limit(10)
        .getRawMany<{ resourceType: string; count: string }>(),

      // Async unusual-activity detection — runs after summary, never blocks API
      this.detector.detect(adminId, since),
    ]);

    return {
      adminId,
      period,
      totalRequests: parseInt(totalResult?.total ?? '0', 10),
      uniqueIpAddresses: parseInt(uniqueIpsResult?.count ?? '0', 10),
      requestsByDay: byDayResult.map((r) => ({
        date: r.date,
        count: parseInt(r.count, 10),
      })),
      topAccessedResources: topResourcesResult.map((r) => ({
        resourceType: r.resourceType,
        count: parseInt(r.count, 10),
      })),
      unusualActivity,
    };
  }

  // ─── Read: session history ─────────────────────────────────────────────────

  async getSessionHistory(adminId: string): Promise<SessionHistoryDto[]> {
    await this.assertAdminExists(adminId);

    // Combine Redis live sessions with DB request-count per session
    const [liveSessionsRaw, dbSessions] = await Promise.all([
      this.cache.hgetall(`auth:sessions:${adminId}`),
      this.repo.query(
        `SELECT session_id,
                MIN(created_at)  AS started_at,
                MAX(created_at)  AS last_used_at,
                COUNT(*)         AS request_count,
                MAX(ip_address)  AS ip_address
         FROM admin_access_logs
         WHERE admin_id = $1
         GROUP BY session_id
         ORDER BY last_used_at DESC
         LIMIT 100`,
        [adminId],
      ) as Promise<
        Array<{
          session_id: string;
          started_at: string;
          last_used_at: string;
          request_count: string;
          ip_address: string;
        }>
      >,
    ]);

    const liveSessionIds = new Set(Object.keys(liveSessionsRaw ?? {}));

    return dbSessions.map((row) => {
      let liveData: any = {};
      if (liveSessionsRaw?.[row.session_id]) {
        try {
          liveData = JSON.parse(liveSessionsRaw[row.session_id]);
        } catch {
          /* ignore */
        }
      }

      return {
        sessionId: row.session_id,
        ipAddress: liveData.ip ?? row.ip_address,
        userAgent: liveData.userAgent,
        createdAt: liveData.createdAt ?? row.started_at,
        lastUsedAt: liveData.lastUsedAt ?? row.last_used_at,
        requestCount: parseInt(row.request_count, 10),
        isActive: liveSessionIds.has(row.session_id),
      };
    });
  }

  // ─── Force-terminate a session ─────────────────────────────────────────────

  async terminateSession(
    targetAdminId: string,
    sessionId: string,
    actorId: string,
  ): Promise<void> {
    await this.assertAdminExists(targetAdminId);

    // Immediately revoke Redis tokens — completes within 1 second
    await Promise.all([
      this.cache.del(`auth:refresh:${targetAdminId}:${sessionId}`),
      this.cache.hdel(`auth:sessions:${targetAdminId}`, sessionId),
    ]);

    // Also blacklist the access token so in-flight JWTs are rejected
    await this.redis.set(
      `auth:revoked_session:${sessionId}`,
      '1',
      24 * 60 * 60, // 24h — longer than any possible JWT lifetime
    );

    await this.audit.log({
      entityType: 'AdminSession',
      entityId: sessionId,
      action: AuditAction.UPDATE,
      actorId,
      actorType: ActorType.ADMIN,
      afterState: {
        targetAdminId,
        sessionId,
        action: 'FORCE_TERMINATED',
      },
      metadata: { event: 'ADMIN_SESSION_FORCE_TERMINATED' },
    });

    this.logger.warn(
      `Session ${sessionId} of admin ${targetAdminId} force-terminated by admin ${actorId}`,
    );
  }

  // ─── Cross-admin activity report ───────────────────────────────────────────

  async getActivityReport(
    period: '7d' | '30d' | '90d' = '30d',
    actorId: string,
  ): Promise<ActivityReportDto> {
    const cacheKey = `admin_activity_report:${period}`;
    const cached = await this.redis.get<ActivityReportDto>(cacheKey);
    if (cached) return cached;

    const since = this.periodToDate(period);

    const [admins, perAdminStats, platformTotals] = await Promise.all([
      this.userRepo.find({
        where: { isActive: true },
        select: ['id', 'email', 'role'],
      }),

      this.repo.query(
        `SELECT
           admin_id,
           COUNT(*)                                       AS total_requests,
           COUNT(*) FILTER (WHERE method != 'GET')        AS mutation_count,
           COUNT(DISTINCT resource_id)
             FILTER (WHERE resource_type = 'Merchant')    AS unique_merchants,
           MAX(created_at)                                AS last_active_at
         FROM admin_access_logs
         WHERE created_at >= $1
         GROUP BY admin_id`,
        [since],
      ) as Promise<
        Array<{
          admin_id: string;
          total_requests: string;
          mutation_count: string;
          unique_merchants: string;
          last_active_at: Date | null;
        }>
      >,

      this.repo.query(
        `SELECT
           COUNT(*)                                       AS total_requests,
           COUNT(*) FILTER (WHERE method != 'GET')        AS total_mutations
         FROM admin_access_logs
         WHERE created_at >= $1`,
        [since],
      ) as Promise<Array<{ total_requests: string; total_mutations: string }>>,
    ]);

    // Detect unusual activity for each active admin — async, fast
    const unusualCounts = await Promise.all(
      perAdminStats.map(async (row) => {
        const flags = await this.detector.detect(row.admin_id, since);
        return { adminId: row.admin_id, count: flags.length };
      }),
    );
    const unusualMap = new Map(unusualCounts.map((u) => [u.adminId, u.count]));

    const adminMap = new Map(admins.map((a) => [a.id, a]));
    const statsMap = new Map(perAdminStats.map((s) => [s.admin_id, s]));

    const adminSummaries: AdminSummaryRowDto[] = admins
      .filter((a) =>
        [
          UserRole.ADMIN,
          UserRole.SUPER_ADMIN,
          UserRole.SUPPORT_ADMIN,
          UserRole.FINANCE_ADMIN,
          UserRole.OPERATIONS_ADMIN,
        ].includes(a.role as UserRole),
      )
      .map((admin) => {
        const stats = statsMap.get(admin.id);
        return {
          admin: { id: admin.id, email: admin.email, role: admin.role },
          totalRequests: parseInt(stats?.total_requests ?? '0', 10),
          mutationCount: parseInt(stats?.mutation_count ?? '0', 10),
          uniqueMerchantsAccessed: parseInt(stats?.unique_merchants ?? '0', 10),
          unusualActivityFlags: unusualMap.get(admin.id) ?? 0,
          lastActiveAt: stats?.last_active_at ?? null,
        };
      });

    const report: ActivityReportDto = {
      period,
      adminSummaries,
      platformTotals: {
        totalAdminRequests: parseInt(
          platformTotals[0]?.total_requests ?? '0',
          10,
        ),
        totalMutations: parseInt(platformTotals[0]?.total_mutations ?? '0', 10),
        adminsWithUnusualActivity: adminSummaries.filter(
          (s) => s.unusualActivityFlags > 0,
        ).length,
      },
    };

    await this.redis.set(cacheKey, report, SUMMARY_CACHE_TTL);
    return report;
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private async assertAdminExists(adminId: string): Promise<void> {
    const exists = await this.userRepo.findOne({ where: { id: adminId } });
    if (!exists)
      throw new NotFoundException(`Admin user '${adminId}' not found`);
  }

  private periodToDate(period: string): Date {
    const days = PERIOD_DAYS[period] ?? 30;
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d;
  }
}
