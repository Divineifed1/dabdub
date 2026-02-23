import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from './base.entity';
import { JobRunStatus } from './scheduled-job.enums';

@Entity('scheduled_job_configs')
@Index(['jobKey'])
export class ScheduledJobConfig extends BaseEntity {
    @Column({ unique: true })
    jobKey: string;

    @Column()
    displayName: string;

    @Column({ type: 'text' })
    description: string;

    @Column()
    cronExpression: string;

    @Column({ type: 'boolean', default: true })
    isEnabled: boolean;

    @Column({ type: 'timestamptz', nullable: true })
    lastRunAt: Date | null;

    @Column({ type: 'enum', enum: JobRunStatus, nullable: true })
    lastRunStatus: JobRunStatus | null;

    @Column({ type: 'int', nullable: true })
    lastRunDurationMs: number | null;

    @Column({ type: 'text', nullable: true })
    lastRunError: string | null;

    @Column({ type: 'timestamptz', nullable: true })
    nextRunAt: Date | null;

    @Column({ type: 'int', default: 0 })
    consecutiveFailures: number;

    @Column({ type: 'boolean', default: false })
    isAutoDisabled: boolean;
}
