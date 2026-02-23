import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from './base.entity';
import { JobRunStatus } from './scheduled-job.enums';

@Entity('scheduled_job_runs')
@Index(['jobKey'])
@Index(['startedAt'])
@Index(['status'])
export class ScheduledJobRun extends BaseEntity {
    @Column()
    jobKey: string;

    @Column({ type: 'enum', enum: JobRunStatus })
    status: JobRunStatus;

    @Column({ type: 'timestamptz' })
    startedAt: Date;

    @Column({ type: 'timestamptz', nullable: true })
    completedAt: Date | null;

    @Column({ type: 'int', nullable: true })
    durationMs: number | null;

    @Column({ type: 'jsonb', nullable: true })
    result: Record<string, unknown> | null;

    @Column({ type: 'text', nullable: true })
    errorMessage: string | null;

    @Column({ type: 'text', nullable: true })
    errorStack: string | null;

    @Column({ type: 'boolean', default: false })
    wasManuallyTriggered: boolean;

    @Column({ nullable: true })
    triggeredById: string | null;
}
