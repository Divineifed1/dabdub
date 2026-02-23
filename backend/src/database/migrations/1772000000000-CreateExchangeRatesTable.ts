import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateExchangeRatesTable1772000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise {
    await queryRunner.query(`CREATE TYPE rate_source_enum AS ENUM ('coinbase','binance','coingecko','aggregated')`);

    await queryRunner.createTable(
      new Table({
        name: 'exchange_rates',
        columns: [
          { name: 'id',                  type: 'uuid',              isPrimary: true, default: 'uuid_generate_v4()' },
          { name: 'crypto_currency',     type: 'varchar', length: '20'  },
          { name: 'fiat_currency',       type: 'varchar', length: '10'  },
          { name: 'rate',                type: 'numeric', precision: 24, scale: 10 },
          { name: 'bid',                 type: 'numeric', precision: 24, scale: 10, isNullable: true },
          { name: 'ask',                 type: 'numeric', precision: 24, scale: 10, isNullable: true },
          { name: 'spread_percent',      type: 'numeric', precision: 10, scale: 4,  isNullable: true },
          { name: 'source',              type: 'rate_source_enum' },
          { name: 'confidence_score',    type: 'numeric', precision: 5,  scale: 4,  isNullable: true },
          { name: 'provider_breakdown',  type: 'jsonb',   isNullable: true },
          { name: 'valid_until',         type: 'timestamptz', isNullable: true },
          { name: 'created_at',          type: 'timestamptz', default: 'now()' },
          { name: 'updated_at',          type: 'timestamptz', default: 'now()' },
        ],
      }),
      true,
    );

    await queryRunner.createIndex('exchange_rates', new TableIndex({
      name: 'idx_exchange_rates_pair_timestamp',
      columnNames: ['crypto_currency', 'fiat_currency', 'created_at'],
    }));

    await queryRunner.createIndex('exchange_rates', new TableIndex({
      name: 'idx_exchange_rates_source_pair',
      columnNames: ['source', 'crypto_currency', 'fiat_currency'],
    }));

    // Partial index: fast lookup for non-stale aggregated rates
    await queryRunner.query(`
      CREATE INDEX idx_exchange_rates_active
        ON exchange_rates (crypto_currency, fiat_currency, created_at DESC)
        WHERE source = 'aggregated' AND (valid_until IS NULL OR valid_until > now())
    `);
  }

  public async down(queryRunner: QueryRunner): Promise {
    await queryRunner.dropTable('exchange_rates');
    await queryRunner.query(`DROP TYPE IF EXISTS rate_source_enum`);
  }
}