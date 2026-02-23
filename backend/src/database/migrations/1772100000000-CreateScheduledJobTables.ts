import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateScheduledJobTables1772100000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        // Create enum types
        await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE job_run_status_enum AS ENUM ('SUCCESS', 'FAILED', 'PARTIAL', 'RUNNING');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

        // Create scheduled_job_configs
        await queryRunner.createTable(
            new Table({
                name: 'scheduled_job_configs',
                columns: [
                    {
                        name: 'id',
                        type: 'uuid',
                        isPrimary: true,
                        generationStrategy: 'uuid',
                        default: 'uuid_generate_v4()',
                    },
                    {
                        name: 'job_key',
                        type: 'varchar',
                        isUnique: true,
                    },
                    {
                        name: 'display_name',
                        type: 'varchar',
                    },
                    {
                        name: 'description',
                        type: 'text',
                    },
                    {
                        name: 'cron_expression',
                        type: 'varchar',
                    },
                    {
                        name: 'is_enabled',
                        type: 'boolean',
                        default: true,
                    },
                    {
                        name: 'last_run_at',
                        type: 'timestamptz',
                        isNullable: true,
                    },
                    {
                        name: 'last_run_status',
                        type: 'job_run_status_enum',
                        isNullable: true,
                    },
                    {
                        name: 'last_run_duration_ms',
                        type: 'int',
                        isNullable: true,
                    },
                    {
                        name: 'last_run_error',
                        type: 'text',
                        isNullable: true,
                    },
                    {
                        name: 'next_run_at',
                        type: 'timestamptz',
                        isNullable: true,
                    },
                    {
                        name: 'consecutive_failures',
                        type: 'int',
                        default: 0,
                    },
                    {
                        name: 'is_auto_disabled',
                        type: 'boolean',
                        default: false,
                    },
                    {
                        name: 'created_at',
                        type: 'timestamptz',
                        default: 'now()',
                    },
                    {
                        name: 'updated_at',
                        type: 'timestamptz',
                        default: 'now()',
                    },
                    {
                        name: 'deleted_at',
                        type: 'timestamptz',
                        isNullable: true,
                    },
                ],
            }),
            true,
        );

        await queryRunner.createIndex(
            'scheduled_job_configs',
            new TableIndex({
                name: 'IDX_scheduled_job_configs_job_key',
                columnNames: ['job_key'],
            }),
        );

        // Create scheduled_job_runs
        await queryRunner.createTable(
            new Table({
                name: 'scheduled_job_runs',
                columns: [
                    {
                        name: 'id',
                        type: 'uuid',
                        isPrimary: true,
                        generationStrategy: 'uuid',
                        default: 'uuid_generate_v4()',
                    },
                    {
                        name: 'job_key',
                        type: 'varchar',
                    },
                    {
                        name: 'status',
                        type: 'job_run_status_enum',
                    },
                    {
                        name: 'started_at',
                        type: 'timestamptz',
                    },
                    {
                        name: 'completed_at',
                        type: 'timestamptz',
                        isNullable: true,
                    },
                    {
                        name: 'duration_ms',
                        type: 'int',
                        isNullable: true,
                    },
                    {
                        name: 'result',
                        type: 'jsonb',
                        isNullable: true,
                    },
                    {
                        name: 'error_message',
                        type: 'text',
                        isNullable: true,
                    },
                    {
                        name: 'error_stack',
                        type: 'text',
                        isNullable: true,
                    },
                    {
                        name: 'was_manually_triggered',
                        type: 'boolean',
                        default: false,
                    },
                    {
                        name: 'triggered_by_id',
                        type: 'varchar',
                        isNullable: true,
                    },
                    {
                        name: 'created_at',
                        type: 'timestamptz',
                        default: 'now()',
                    },
                    {
                        name: 'updated_at',
                        type: 'timestamptz',
                        default: 'now()',
                    },
                    {
                        name: 'deleted_at',
                        type: 'timestamptz',
                        isNullable: true,
                    },
                ],
            }),
            true,
        );

        await queryRunner.createIndex(
            'scheduled_job_runs',
            new TableIndex({
                name: 'IDX_scheduled_job_runs_job_key',
                columnNames: ['job_key'],
            }),
        );
        await queryRunner.createIndex(
            'scheduled_job_runs',
            new TableIndex({
                name: 'IDX_scheduled_job_runs_started_at',
                columnNames: ['started_at'],
            }),
        );
        await queryRunner.createIndex(
            'scheduled_job_runs',
            new TableIndex({
                name: 'IDX_scheduled_job_runs_status',
                columnNames: ['status'],
            }),
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.dropTable('scheduled_job_runs', true);
        await queryRunner.dropTable('scheduled_job_configs', true);
        await queryRunner.query(`DROP TYPE IF EXISTS job_run_status_enum;`);
    }
}
