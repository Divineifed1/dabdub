import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ScheduledJobsService } from './scheduled-jobs.service';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class ScheduledJobCronService implements OnModuleInit {
    private readonly logger = new Logger(ScheduledJobCronService.name);

    constructor(
        @InjectQueue('scheduled-jobs')
        private readonly scheduledJobsQueue: Queue,
        private readonly scheduledJobsService: ScheduledJobsService,
    ) { }

    /** On startup: compute nextRunAt for all enabled jobs */
    async onModuleInit(): Promise<void> {
        try {
            await this.scheduledJobsService.refreshNextRunTimes();
            this.logger.log('Initialized nextRunAt for all scheduled jobs');
        } catch (err) {
            this.logger.warn('Could not initialize job next-run times on startup', err);
        }
    }

    /**
     * Runs every minute:
     * 1. Refresh nextRunAt for all enabled jobs
     * 2. Find jobs that are due (nextRunAt <= now)
     * 3. Enqueue them in BullMQ
     */
    @Cron('* * * * *')
    async evaluateScheduledJobs(): Promise<void> {
        try {
            // First refresh nextRunAt based on current time
            await this.scheduledJobsService.refreshNextRunTimes();

            const dueJobs = await this.scheduledJobsService.getDueJobs();

            if (dueJobs.length === 0) return;

            this.logger.log(`Enqueueing ${dueJobs.length} due scheduled job(s)`);

            for (const job of dueJobs) {
                const runId = uuidv4();
                await this.scheduledJobsQueue.add(
                    job.jobKey,
                    {
                        jobKey: job.jobKey,
                        runId,
                        wasManuallyTriggered: false,
                        triggeredById: null,
                    },
                    { jobId: runId },
                );
                this.logger.debug(`Enqueued scheduled job: ${job.jobKey} (runId=${runId})`);
            }
        } catch (err) {
            this.logger.error('Error during scheduled job evaluation', err);
        }
    }
}
