import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { ScheduledJobConfig } from '../../../database/entities/scheduled-job-config.entity';
import { ScheduledJobRun } from '../../../database/entities/scheduled-job-run.entity';
import { ScheduledJobsService } from './scheduled-jobs.service';
import { ScheduledJobProcessor } from './scheduled-job.processor';
import { ScheduledJobCronService } from './scheduled-job-cron.service';
import {
    ScheduledJobsController,
    ScheduledJobsSuperAdminController,
} from './scheduled-jobs.controller';
import { AuditModule } from '../../../audit/audit.module';
import { CacheModule } from '../../../cache/cache.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([ScheduledJobConfig, ScheduledJobRun]),
        BullModule.registerQueue({
            name: 'scheduled-jobs',
            defaultJobOptions: {
                attempts: 1, // Don't auto-retry scheduled jobs; they will be re-scheduled
                removeOnComplete: 100,
                removeOnFail: 200,
            },
        }),
        AuditModule,
        CacheModule,
    ],
    controllers: [ScheduledJobsController, ScheduledJobsSuperAdminController],
    providers: [ScheduledJobsService, ScheduledJobProcessor, ScheduledJobCronService],
    exports: [ScheduledJobsService],
})
export class ScheduledJobsModule { }
