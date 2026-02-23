import { DataSource } from 'typeorm';

const SCHEDULED_JOBS = [
    {
        jobKey: 'daily.settlement.run',
        displayName: 'Daily Settlement Run',
        description: 'Processes and settles all pending merchant settlements',
        cronExpression: '0 2 * * *',
    },
    {
        jobKey: 'exchange.rate.refresh',
        displayName: 'Exchange Rate Refresh',
        description: 'Fetches and updates latest exchange rates from external feeds',
        cronExpression: '*/5 * * * *',
    },
    {
        jobKey: 'kyc.reminder.emails',
        displayName: 'KYC Reminder Emails',
        description: 'Sends reminder emails to merchants with pending KYC verification',
        cronExpression: '0 10 * * 1-5',
    },
    {
        jobKey: 'document.expiry.alerts',
        displayName: 'Document Expiry Alerts',
        description: 'Notifies merchants of expiring KYC documents',
        cronExpression: '0 8 * * *',
    },
    {
        jobKey: 'platform.metrics.snapshot',
        displayName: 'Platform Metrics Snapshot',
        description: 'Captures hourly platform health and performance metrics',
        cronExpression: '0 * * * *',
    },
    {
        jobKey: 'merchant.health.check',
        displayName: 'Merchant Health Check',
        description: 'Verifies merchant account statuses and triggers alerts for anomalies',
        cronExpression: '*/15 * * * *',
    },
    {
        jobKey: 'alert.rule.evaluation',
        displayName: 'Alert Rule Evaluation',
        description: 'Evaluates all active alert rules and fires notifications',
        cronExpression: '* * * * *',
    },
    {
        jobKey: 'data.retention.purge',
        displayName: 'Data Retention Purge',
        description: 'Purges data that has exceeded retention policies (runs Sunday 3 AM)',
        cronExpression: '0 3 * * 0',
    },
    {
        jobKey: 'export.cleanup',
        displayName: 'Export Cleanup',
        description: 'Removes stale and expired export files from storage',
        cronExpression: '0 4 * * *',
    },
    {
        jobKey: 'report.scheduler',
        displayName: 'Report Scheduler',
        description: 'Queues scheduled merchant and platform reports for generation',
        cronExpression: '* * * * *',
    },
];

export class ScheduledJobsSeeder {
    static async seed(dataSource: DataSource): Promise<void> {
        for (const job of SCHEDULED_JOBS) {
            const existing = await dataSource.query(
                `SELECT id FROM scheduled_job_configs WHERE job_key = $1`,
                [job.jobKey],
            );

            if (existing.length === 0) {
                await dataSource.query(
                    `INSERT INTO scheduled_job_configs
            (id, job_key, display_name, description, cron_expression, is_enabled,
             consecutive_failures, is_auto_disabled,
             last_run_at, last_run_status, last_run_duration_ms, last_run_error, next_run_at,
             created_at, updated_at)
           VALUES
            (uuid_generate_v4(), $1, $2, $3, $4, true,
             0, false,
             NULL, NULL, NULL, NULL, NULL,
             now(), now())`,
                    [job.jobKey, job.displayName, job.description, job.cronExpression],
                );
                console.log(`  ✓ Seeded job: ${job.jobKey}`);
            } else {
                console.log(`  – Skipped (already exists): ${job.jobKey}`);
            }
        }
    }
}
