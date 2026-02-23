import {
    Injectable,
    Logger,
    NotFoundException,
    ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ScheduledJobConfig } from '../../../database/entities/scheduled-job-config.entity';
import { ScheduledJobRun } from '../../../database/entities/scheduled-job-run.entity';
import { JobRunStatus } from '../../../database/entities/scheduled-job.enums';
import { UpdateScheduledJobDto } from './dto/update-scheduled-job.dto';
import { validateCronExpression, getNextRunDate } from './cron-validator.util';
import { AuditLogService } from '../../../audit/audit-log.service';
import { AuditAction, ActorType } from '../../../database/entities/audit-log.enums';
import { CacheService } from '../../../cache/cache.service';
import { UserRole } from '../../../database/entities/user.entity';
import { v4 as uuidv4 } from 'uuid';

const OVERVIEW_CACHE_KEY = 'scheduled_jobs:overview';
const OVERVIEW_CACHE_TTL = 30; // 30 seconds
const CONSECUTIVE_FAILURES_THRESHOLD = 5;

export interface JobsOverview {
    totalJobs: number;
    enabledJobs: number;
    disabledJobs: number;
    autoDisabledJobs: number;
    failedLastRun: number;
    nextScheduledRun: { jobKey: string; nextRunAt: Date } | null;
    jobsWithConsecutiveFailures: {
        jobKey: string;
        consecutiveFailures: number;
        lastError: string | null;
    }[];
}

@Injectable()
export class ScheduledJobsService {
    private readonly logger = new Logger(ScheduledJobsService.name);

    constructor(
        @InjectRepository(ScheduledJobConfig)
        private readonly jobConfigRepo: Repository<ScheduledJobConfig>,

        @InjectRepository(ScheduledJobRun)
        private readonly jobRunRepo: Repository<ScheduledJobRun>,

        @InjectQueue('scheduled-jobs')
        private readonly scheduledJobsQueue: Queue,

        private readonly auditLogService: AuditLogService,
        private readonly cacheService: CacheService,
    ) { }

    // ──────────────────────────────────────────────────────────────────────────
    // Queries
    // ──────────────────────────────────────────────────────────────────────────

    async listAll(): Promise<ScheduledJobConfig[]> {
        return this.jobConfigRepo.find({ order: { jobKey: 'ASC' } });
    }

    async getDetail(jobKey: string): Promise<{
        config: ScheduledJobConfig;
        recentRuns: ScheduledJobRun[];
    }> {
        const config = await this.getByKey(jobKey);
        const recentRuns = await this.jobRunRepo.find({
            where: { jobKey },
            order: { startedAt: 'DESC' },
            take: 50,
        });
        return { config, recentRuns };
    }

    async getRuns(
        jobKey: string,
        page = 1,
        limit = 20,
    ): Promise<{ data: ScheduledJobRun[]; total: number; page: number; limit: number }> {
        await this.getByKey(jobKey); // validates existence
        const [data, total] = await this.jobRunRepo.findAndCount({
            where: { jobKey },
            order: { startedAt: 'DESC' },
            skip: (page - 1) * limit,
            take: limit,
        });
        return { data, total, page, limit };
    }

    async getOverview(): Promise<JobsOverview> {
        const cached = await this.cacheService.get<JobsOverview>(OVERVIEW_CACHE_KEY);
        if (cached) return cached;

        const all = await this.jobConfigRepo.find();
        const enabledJobs = all.filter((j) => j.isEnabled).length;
        const disabledJobs = all.filter((j) => !j.isEnabled).length;
        const autoDisabledJobs = all.filter((j) => j.isAutoDisabled).length;
        const failedLastRun = all.filter(
            (j) => j.lastRunStatus === JobRunStatus.FAILED,
        ).length;

        const upcoming = all
            .filter((j) => j.isEnabled && !j.isAutoDisabled && j.nextRunAt)
            .sort(
                (a, b) =>
                    new Date(a.nextRunAt!).getTime() - new Date(b.nextRunAt!).getTime(),
            );

        const nextScheduledRun =
            upcoming.length > 0
                ? { jobKey: upcoming[0].jobKey, nextRunAt: upcoming[0].nextRunAt! }
                : null;

        const jobsWithConsecutiveFailures = all
            .filter((j) => j.consecutiveFailures > 0)
            .map((j) => ({
                jobKey: j.jobKey,
                consecutiveFailures: j.consecutiveFailures,
                lastError: j.lastRunError,
            }));

        const overview: JobsOverview = {
            totalJobs: all.length,
            enabledJobs,
            disabledJobs,
            autoDisabledJobs,
            failedLastRun,
            nextScheduledRun,
            jobsWithConsecutiveFailures,
        };

        await this.cacheService.set(OVERVIEW_CACHE_KEY, overview, { ttl: OVERVIEW_CACHE_TTL * 1000 });
        return overview;
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Mutations
    // ──────────────────────────────────────────────────────────────────────────

    async update(
        jobKey: string,
        dto: UpdateScheduledJobDto,
        callerRole?: string,
    ): Promise<ScheduledJobConfig> {
        const config = await this.getByKey(jobKey);

        // Validate cron expression before saving
        if (dto.cronExpression !== undefined) {
            validateCronExpression(dto.cronExpression);
            config.cronExpression = dto.cronExpression;
            config.nextRunAt = getNextRunDate(dto.cronExpression);
        }

        if (dto.isEnabled !== undefined) {
            // Only SUPER_ADMIN can re-enable an auto-disabled job
            if (dto.isEnabled && config.isAutoDisabled) {
                if (callerRole !== UserRole.SUPER_ADMIN) {
                    throw new ForbiddenException(
                        'Only SUPER_ADMIN can re-enable an auto-disabled job',
                    );
                }
                // Reset auto-disable state
                config.isAutoDisabled = false;
                config.consecutiveFailures = 0;
            }
            config.isEnabled = dto.isEnabled;
        }

        const saved = await this.jobConfigRepo.save(config);
        await this.cacheService.del(OVERVIEW_CACHE_KEY);
        return saved;
    }

    async triggerManually(
        jobKey: string,
        triggeredById: string,
    ): Promise<{ jobKey: string; runId: string; status: string; message: string }> {
        const config = await this.getByKey(jobKey);

        if (!config.isEnabled || config.isAutoDisabled) {
            throw new ForbiddenException(
                `Job "${jobKey}" is disabled and cannot be triggered manually`,
            );
        }

        const runId = uuidv4();

        // Enqueue immediately in BullMQ
        await this.scheduledJobsQueue.add(
            jobKey,
            { jobKey, runId, wasManuallyTriggered: true, triggeredById },
            { jobId: runId, priority: 1 },
        );

        // Create the run record in QUEUED state (will be updated by processor)
        const run = this.jobRunRepo.create({
            id: runId,
            jobKey,
            status: JobRunStatus.RUNNING,
            startedAt: new Date(),
            wasManuallyTriggered: true,
            triggeredById,
        });
        await this.jobRunRepo.save(run);

        // Audit log
        await this.auditLogService.log({
            entityType: 'ScheduledJobConfig',
            entityId: config.id,
            action: AuditAction.UPDATE,
            actorId: triggeredById,
            actorType: ActorType.ADMIN,
            metadata: {
                event: 'SCHEDULED_JOB_MANUALLY_TRIGGERED',
                jobKey,
                runId,
            },
        });

        this.logger.log(`Manual trigger: ${jobKey} by ${triggeredById} → runId=${runId}`);

        return {
            jobKey,
            runId,
            status: 'QUEUED',
            message: 'Job queued for immediate execution',
        };
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Run lifecycle helpers (called from processor / cron scheduler)
    // ──────────────────────────────────────────────────────────────────────────

    async recordRunStart(
        runId: string,
        jobKey: string,
        wasManuallyTriggered: boolean,
        triggeredById: string | null,
    ): Promise<ScheduledJobRun> {
        const existing = await this.jobRunRepo.findOne({ where: { id: runId } });
        if (existing) {
            // Already created (manual trigger path) – update status to RUNNING
            existing.status = JobRunStatus.RUNNING;
            return this.jobRunRepo.save(existing);
        }

        const run = this.jobRunRepo.create({
            id: runId,
            jobKey,
            status: JobRunStatus.RUNNING,
            startedAt: new Date(),
            wasManuallyTriggered,
            triggeredById,
        });
        return this.jobRunRepo.save(run);
    }

    async recordRunComplete(
        runId: string,
        jobKey: string,
        status: JobRunStatus,
        result: Record<string, unknown> | null,
        durationMs: number,
        errorMessage?: string,
        errorStack?: string,
    ): Promise<void> {
        const completedAt = new Date();

        // Update the run record
        await this.jobRunRepo.update(runId, {
            status,
            completedAt,
            durationMs,
            result,
            errorMessage: errorMessage ?? null,
            errorStack: errorStack ?? null,
        });

        // Update the config with last run info
        const config = await this.jobConfigRepo.findOne({ where: { jobKey } });
        if (!config) return;

        config.lastRunAt = completedAt;
        config.lastRunStatus = status;
        config.lastRunDurationMs = durationMs;
        config.lastRunError = errorMessage ?? null;

        if (status === JobRunStatus.SUCCESS || status === JobRunStatus.PARTIAL) {
            config.consecutiveFailures = 0;
        } else if (status === JobRunStatus.FAILED) {
            config.consecutiveFailures += 1;
            await this.handleAutoDisable(config);
        }

        // Compute next run
        config.nextRunAt = getNextRunDate(config.cronExpression);

        await this.jobConfigRepo.save(config);
        await this.cacheService.del(OVERVIEW_CACHE_KEY);
    }

    /** Compute & persist nextRunAt for all enabled jobs (called on startup/cron tick) */
    async refreshNextRunTimes(): Promise<void> {
        const jobs = await this.jobConfigRepo.find({ where: { isEnabled: true } });
        for (const job of jobs) {
            const nextRunAt = getNextRunDate(job.cronExpression);
            if (nextRunAt) {
                await this.jobConfigRepo.update(job.id, { nextRunAt });
            }
        }
    }

    /** Returns all enabled, non-auto-disabled jobs whose nextRunAt is due */
    async getDueJobs(): Promise<ScheduledJobConfig[]> {
        const now = new Date();
        return this.jobConfigRepo
            .createQueryBuilder('j')
            .where('j.isEnabled = true')
            .andWhere('j.isAutoDisabled = false')
            .andWhere('j.nextRunAt IS NOT NULL')
            .andWhere('j.nextRunAt <= :now', { now })
            .andWhere('j.lastRunStatus != :running OR j.lastRunStatus IS NULL', {
                running: JobRunStatus.RUNNING,
            })
            .getMany();
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Private helpers
    // ──────────────────────────────────────────────────────────────────────────

    private async getByKey(jobKey: string): Promise<ScheduledJobConfig> {
        const config = await this.jobConfigRepo.findOne({ where: { jobKey } });
        if (!config) {
            throw new NotFoundException(`Scheduled job "${jobKey}" not found`);
        }
        return config;
    }

    private async handleAutoDisable(config: ScheduledJobConfig): Promise<void> {
        if (
            config.consecutiveFailures >= CONSECUTIVE_FAILURES_THRESHOLD &&
            !config.isAutoDisabled
        ) {
            config.isAutoDisabled = true;
            config.isEnabled = false;
            this.logger.error(
                `AUTO-DISABLED: Job "${config.jobKey}" has ${config.consecutiveFailures} consecutive failures. ` +
                `Last error: ${config.lastRunError ?? 'unknown'}`,
            );
            // System alert – log as CRITICAL via audit
            await this.auditLogService.log({
                entityType: 'ScheduledJobConfig',
                entityId: config.id,
                action: AuditAction.UPDATE,
                actorId: 'system',
                actorType: ActorType.SYSTEM,
                metadata: {
                    event: 'SCHEDULED_JOB_AUTO_DISABLED',
                    jobKey: config.jobKey,
                    consecutiveFailures: config.consecutiveFailures,
                    lastError: config.lastRunError,
                    severity: 'CRITICAL',
                },
            });
        }
    }
}
