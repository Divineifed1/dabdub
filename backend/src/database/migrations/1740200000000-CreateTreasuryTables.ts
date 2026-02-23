import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateTreasuryTables1740200000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'platform_wallets',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, default: 'uuid_generate_v4()' },
          { name: 'chain', type: 'varchar', isUnique: true },
          { name: 'walletAddress', type: 'varchar' },
          { name: 'totalFeesCollectedAllTime', type: 'decimal', precision: 30, scale: 18, default: 0 },
          { name: 'totalWithdrawnAllTime', type: 'decimal', precision: 30, scale: 18, default: 0 },
          { name: 'lastWithdrawalAt', type: 'timestamptz', isNullable: true },
          { name: 'isActive', type: 'boolean', default: true },
          { name: 'createdAt', type: 'timestamptz', default: 'now()' },
          { name: 'updatedAt', type: 'timestamptz', default: 'now()' },
          { name: 'deletedAt', type: 'timestamptz', isNullable: true },
        ],
      }),
      true,
    );

    await queryRunner.createTable(
      new Table({
        name: 'treasury_whitelist_addresses',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, default: 'uuid_generate_v4()' },
          { name: 'address', type: 'varchar' },
          { name: 'label', type: 'varchar' },
          { name: 'allowedChains', type: 'jsonb', default: "'[]'" },
          { name: 'isActive', type: 'boolean', default: true },
          { name: 'addedById', type: 'varchar' },
          { name: 'removedById', type: 'varchar', isNullable: true },
          { name: 'removedAt', type: 'timestamptz', isNullable: true },
          { name: 'createdAt', type: 'timestamptz', default: 'now()' },
          { name: 'updatedAt', type: 'timestamptz', default: 'now()' },
          { name: 'deletedAt', type: 'timestamptz', isNullable: true },
        ],
      }),
      true,
    );

    await queryRunner.createTable(
      new Table({
        name: 'treasury_withdrawals',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, default: 'uuid_generate_v4()' },
          { name: 'chain', type: 'varchar' },
          { name: 'fromAddress', type: 'varchar' },
          { name: 'toAddress', type: 'varchar' },
          { name: 'tokenAmount', type: 'decimal', precision: 30, scale: 18 },
          { name: 'tokenSymbol', type: 'varchar' },
          { name: 'usdValueAtTime', type: 'decimal', precision: 20, scale: 8 },
          { name: 'status', type: 'varchar' },
          { name: 'reason', type: 'text' },
          { name: 'requestedById', type: 'varchar' },
          { name: 'approvedById', type: 'varchar', isNullable: true },
          { name: 'rejectedById', type: 'varchar', isNullable: true },
          { name: 'rejectionReason', type: 'text', isNullable: true },
          { name: 'txHash', type: 'varchar', isNullable: true },
          { name: 'approvedAt', type: 'timestamptz', isNullable: true },
          { name: 'completedAt', type: 'timestamptz', isNullable: true },
          { name: 'approvedWhitelistAddresses', type: 'jsonb', default: "'[]'" },
          { name: 'createdAt', type: 'timestamptz', default: 'now()' },
          { name: 'updatedAt', type: 'timestamptz', default: 'now()' },
          { name: 'deletedAt', type: 'timestamptz', isNullable: true },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'treasury_withdrawals',
      new TableIndex({ name: 'idx_treasury_withdrawals_status', columnNames: ['status'] }),
    );

    await queryRunner.createIndex(
      'treasury_withdrawals',
      new TableIndex({ name: 'idx_treasury_withdrawals_chain', columnNames: ['chain'] }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('treasury_withdrawals');
    await queryRunner.dropTable('treasury_whitelist_addresses');
    await queryRunner.dropTable('platform_wallets');
  }
}
