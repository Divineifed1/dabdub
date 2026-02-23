import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { ScheduledJobsService } from './scheduled-jobs.service';
import { JobRunStatus } from '../../../database/entities/scheduled-job.enums';
import { v4 as uuidv4 } from 'uuid';

export interface ScheduledJobPayload {
    jobKey: string;
    runId?: string;
    wasManuallyTriggered?: boolean;
    triggeredById?: string | null;
}

@Processor('scheduled-jobs')
export class ScheduledJobProcessor extends WorkerHost {
    private readonly logger = new Logger(ScheduledJobProcessor.name);

    constructor(private readonly scheduledJobsService: ScheduledJobsService) {
        super();
    }

    async process(job: Job<ScheduledJobPayload>): Promise<unknown> {
        const { jobKey, wasManuallyTriggered = false, triggeredById = null } = job.data;
        const runId = job.data.runId ?? job.id ?? uuidv4();
        const startTime = Date.now();

        this.logger.log(
            `[${jobKey}] Starting execution (runId=${runId}, manual=${wasManuallyTriggered})`,
        );

        await this.scheduledJobsService.recordRunStart(
            runId,
            jobKey,
            wasManuallyTriggered,
            triggeredById ?? null,
        );

        try {
            const result = await this.dispatchJob(jobKey);
            const durationMs = Date.now() - startTime;

            await this.scheduledJobsService.recordRunComplete(
                runId,
                jobKey,
                JobRunStatus.SUCCESS,
                result,
                durationMs,
            );

            this.logger.log(`[${jobKey}] Completed successfully in ${durationMs}ms`);
            return result;
        } catch (error: any) {
            const durationMs = Date.now() - startTime;

            this.logger.error(
                `[${jobKey}] Failed after ${durationMs}ms: ${error?.message}`,
                error?.stack,
            );

            await this.scheduledJobsService.recordRunComplete(
                runId,
                jobKey,
                JobRunStatus.FAILED,
                null,
                durationMs,
                error?.message ?? 'Unknown error',
                error?.stack,
            );

            throw error; // re-throw so BullMQ marks the job as failed
        }
    }

    /**
     * Dispatches the job to the appropriate handler based on jobKey.
     * Each case should call the actual underlying service method.
     * Stub implementations log a warning until wired to real services.
     */
    private async dispatchJob(jobKey: string): Promise<Record<string, unknown>> {
        switch (jobKey) {
            case 'daily.settlement.run':
                return this.runStub(jobKey, { description: 'Processes pending merchant settlements' });

            case 'exchange.rate.refresh':
                return this.runStub(jobKey, { description: 'Refreshes exchange rates from external feeds' });

            case 'kyc.reminder.emails':
                return this.runStub(jobKey, { description: 'Sends KYC reminder emails to merchants' });

            case 'document.expiry.alerts':
                return this.runStub(jobKey, { description: 'Sends document expiry alerts' });

            case 'platform.metrics.snapshot':
                return this.runStub(jobKey, { description: 'Captures platform metrics snapshot' });

            case 'merchant.health.check':
                return this.runStub(jobKey, { description: 'Checks merchant account health' });

            case 'alert.rule.evaluation':
                return this.runStub(jobKey, { description: 'Evaluates active alert rules' });

            case 'data.retention.purge':
                return this.runStub(jobKey, { description: 'Purges data exceeding retention policies' });

            case 'export.cleanup':
                return this.runStub(jobKey, { description: 'Removes stale export files' });

            case 'report.scheduler':
                return this.runStub(jobKey, { description: 'Queues scheduled reports for generation' });

            default:
                this.logger.warn(`[${jobKey}] No handler registered for this job key`);
                return { warning: `No handler for job key: ${jobKey}` };
        }
    }

    private async runStub(
        jobKey: string,
        meta: Record<string, unknown>,
    ): Promise<Record<string, unknown>> {
        this.logger.debug(`[${jobKey}] Running stub handler`);
        return { jobKey, ...meta, executedAt: new Date().toISOString() };
    }
}
