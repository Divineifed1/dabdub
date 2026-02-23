import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateMaintenanceTables1700000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'maintenance_windows',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, default: 'uuid_generate_v4()' },
          { name: 'title', type: 'varchar', length: '255' },
          { name: 'description', type: 'text' },
          { name: 'type', type: 'enum', enum: ['PLANNED_DOWNTIME', 'PARTIAL_DEGRADATION', 'EMERGENCY', 'INFRASTRUCTURE_UPGRADE'] },
          { name: 'status', type: 'enum', enum: ['SCHEDULED', 'ACTIVE', 'COMPLETED', 'CANCELLED'] },
          { name: 'scheduledStartAt', type: 'timestamptz' },
          { name: 'scheduledEndAt', type: 'timestamptz' },
          { name: 'actualStartAt', type: 'timestamptz', isNullable: true },
          { name: 'actualEndAt', type: 'timestamptz', isNullable: true },
          { name: 'affectedServices', type: 'jsonb', default: "'[]'" },
          { name: 'notifyMerchants', type: 'boolean', default: true },
          { name: 'blockNewTransactions', type: 'boolean', default: false },
          { name: 'pauseSettlements', type: 'boolean', default: false },
          { name: 'createdById', type: 'uuid' },
          { name: 'cancelledById', type: 'uuid', isNullable: true },
          { name: 'cancellationReason', type: 'text', isNullable: true },
          { name: 'createdAt', type: 'timestamptz', default: 'now()' },
          { name: 'updatedAt', type: 'timestamptz', default: 'now()' },
          { name: 'deletedAt', type: 'timestamptz', isNullable: true },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'maintenance_windows',
      new TableIndex({ name: 'idx_maintenance_status', columnNames: ['status'] }),
    );

    await queryRunner.createIndex(
      'maintenance_windows',
      new TableIndex({ name: 'idx_maintenance_scheduled_start', columnNames: ['scheduledStartAt'] }),
    );

    await queryRunner.createTable(
      new Table({
        name: 'system_announcements',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, default: 'uuid_generate_v4()' },
          { name: 'title', type: 'varchar', length: '255' },
          { name: 'body', type: 'text' },
          { name: 'type', type: 'enum', enum: ['INFO', 'WARNING', 'MAINTENANCE', 'INCIDENT', 'RESOLVED'] },
          { name: 'audience', type: 'enum', enum: ['ALL_MERCHANTS', 'SPECIFIC_MERCHANTS', 'SPECIFIC_TIERS', 'INTERNAL_ONLY'] },
          { name: 'audienceFilter', type: 'jsonb', isNullable: true },
          { name: 'isPublished', type: 'boolean', default: false },
          { name: 'publishedAt', type: 'timestamptz', isNullable: true },
          { name: 'publishedById', type: 'uuid', isNullable: true },
          { name: 'expiresAt', type: 'timestamptz', isNullable: true },
          { name: 'sendEmail', type: 'boolean', default: false },
          { name: 'emailSent', type: 'boolean', default: false },
          { name: 'emailRecipientsCount', type: 'int', default: 0 },
          { name: 'createdAt', type: 'timestamptz', default: 'now()' },
          { name: 'updatedAt', type: 'timestamptz', default: 'now()' },
          { name: 'deletedAt', type: 'timestamptz', isNullable: true },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'system_announcements',
      new TableIndex({ name: 'idx_announcement_published', columnNames: ['isPublished'] }),
    );

    await queryRunner.createIndex(
      'system_announcements',
      new TableIndex({ name: 'idx_announcement_type', columnNames: ['type'] }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('system_announcements');
    await queryRunner.dropTable('maintenance_windows');
  }
}
