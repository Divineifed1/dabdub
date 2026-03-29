import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateOnrampOrders1760000000000 implements MigrationInterface {
  name = 'CreateOnrampOrders1760000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    await queryRunner.query(
      `CREATE TYPE "public"."onramp_orders_status_enum" AS ENUM('pending', 'paid', 'credited', 'expired', 'failed')`,
    );

    await queryRunner.createTable(
      new Table({
        name: 'onramp_orders',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'uuid_generate_v4()',
          },
          {
            name: 'createdAt',
            type: 'TIMESTAMP',
            default: 'now()',
          },
          {
            name: 'updatedAt',
            type: 'TIMESTAMP',
            default: 'now()',
          },
          {
            name: 'user_id',
            type: 'uuid',
          },
          {
            name: 'reference',
            type: 'varchar',
            length: '64',
          },
          {
            name: 'amount_ngn',
            type: 'numeric',
            precision: 18,
            scale: 2,
          },
          {
            name: 'fee_ngn',
            type: 'numeric',
            precision: 18,
            scale: 2,
          },
          {
            name: 'net_ngn',
            type: 'numeric',
            precision: 18,
            scale: 2,
          },
          {
            name: 'amount_usdc',
            type: 'numeric',
            precision: 18,
            scale: 6,
          },
          {
            name: 'rate_ngn_per_usdc',
            type: 'numeric',
            precision: 18,
            scale: 6,
          },
          {
            name: 'spread_percent',
            type: 'numeric',
            precision: 8,
            scale: 4,
          },
          {
            name: 'status',
            type: '"public"."onramp_orders_status_enum"',
            default: `'pending'`,
          },
          {
            name: 'virtual_account_number',
            type: 'varchar',
            length: '32',
            isNullable: true,
          },
          {
            name: 'virtual_account_bank_name',
            type: 'varchar',
            length: '128',
            isNullable: true,
          },
          {
            name: 'virtual_account_name',
            type: 'varchar',
            length: '128',
            isNullable: true,
          },
          {
            name: 'flutterwave_reference',
            type: 'varchar',
            length: '128',
            isNullable: true,
          },
          {
            name: 'settlement_reference',
            type: 'varchar',
            length: '128',
            isNullable: true,
          },
          {
            name: 'failure_reason',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'webhook_payload',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'paid_at',
            type: 'timestamptz',
            isNullable: true,
          },
          {
            name: 'credited_at',
            type: 'timestamptz',
            isNullable: true,
          },
          {
            name: 'expires_at',
            type: 'timestamptz',
          },
        ],
        foreignKeys: [
          {
            columnNames: ['user_id'],
            referencedTableName: 'users',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          },
        ],
      }),
    );

    await queryRunner.createIndices('onramp_orders', [
      new TableIndex({
        name: 'IDX_onramp_orders_reference',
        columnNames: ['reference'],
        isUnique: true,
      }),
      new TableIndex({
        name: 'IDX_onramp_orders_user_created_at',
        columnNames: ['user_id', 'createdAt'],
      }),
      new TableIndex({
        name: 'IDX_onramp_orders_status_expires_at',
        columnNames: ['status', 'expires_at'],
      }),
    ]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('onramp_orders');
    await queryRunner.query(`DROP TYPE "public"."onramp_orders_status_enum"`);
  }
}
