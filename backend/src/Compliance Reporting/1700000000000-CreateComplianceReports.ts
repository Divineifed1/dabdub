import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateComplianceReports1700000000000 implements MigrationInterface {
  name = 'CreateComplianceReports1700000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE compliance_report_type_enum AS ENUM (
        'TRANSACTION_REPORT',
        'MERCHANT_DUE_DILIGENCE',
        'AML_SUMMARY',
        'FEE_REPORT',
        'SETTLEMENT_REPORT'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE compliance_report_status_enum AS ENUM (
        'QUEUED',
        'PROCESSING',
        'COMPLETED',
        'FAILED'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE compliance_report_format_enum AS ENUM (
        'CSV',
        'XLSX',
        'PDF'
      )
    `);

    await queryRunner.createTable(
      new Table({
        name: 'compliance_reports',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, generationStrategy: 'uuid', default: 'uuid_generate_v4()' },
          { name: 'report_type', type: 'compliance_report_type_enum' },
          { name: 'status', type: 'compliance_report_status_enum', default: "'QUEUED'" },
          { name: 'format', type: 'compliance_report_format_enum' },
          { name: 'start_date', type: 'date' },
          { name: 'end_date', type: 'date' },
          { name: 'merchant_id', type: 'uuid', isNullable: true },
          { name: 'notes', type: 'text', isNullable: true },
          { name: 'row_count', type: 'integer', isNullable: true },
          { name: 'file_size_bytes', type: 'bigint', isNullable: true },
          { name: 's3_key', type: 'varchar', isNullable: true },
          { name: 'error_message', type: 'text', isNullable: true },
          { name: 'generated_at', type: 'timestamptz', isNullable: true },
          { name: 'expires_at', type: 'timestamptz', isNullable: true },
          { name: 'requested_by_id', type: 'uuid' },
          { name: 'requested_by_email', type: 'varchar' },
          { name: 'created_at', type: 'timestamptz', default: 'now()' },
          { name: 'updated_at', type: 'timestamptz', default: 'now()' },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'compliance_reports',
      new TableIndex({ name: 'IDX_compliance_reports_status', columnNames: ['status'] }),
    );

    await queryRunner.createIndex(
      'compliance_reports',
      new TableIndex({
        name: 'IDX_compliance_reports_requested_by',
        columnNames: ['requested_by_id'],
      }),
    );

    await queryRunner.createIndex(
      'compliance_reports',
      new TableIndex({
        name: 'IDX_compliance_reports_merchant',
        columnNames: ['merchant_id'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('compliance_reports');
    await queryRunner.query('DROP TYPE IF EXISTS compliance_report_type_enum');
    await queryRunner.query('DROP TYPE IF EXISTS compliance_report_status_enum');
    await queryRunner.query('DROP TYPE IF EXISTS compliance_report_format_enum');
  }
}
