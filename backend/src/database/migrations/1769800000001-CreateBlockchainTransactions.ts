import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateBlockchainTransactions1769800000001 implements MigrationInterface {
  name = 'CreateBlockchainTransactions1769800000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "blockchain_transactions_type_enum" AS ENUM ('deposit', 'withdrawal', 'transfer', 'stake', 'unstake', 'paylink_payment')
    `);

    await queryRunner.query(`
      CREATE TYPE "blockchain_transactions_status_enum" AS ENUM ('pending', 'submitted', 'confirmed', 'failed')
    `);

    await queryRunner.query(`
      CREATE TABLE "blockchain_transactions" (
        "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "user_id" UUID NOT NULL,
        "type" "blockchain_transactions_type_enum" NOT NULL,
        "tx_hash" VARCHAR NULL,
        "status" "blockchain_transactions_status_enum" NOT NULL DEFAULT 'pending',
        "from_address" VARCHAR NOT NULL,
        "to_address" VARCHAR DEFAULT NULL,
        "amount_usdc" VARCHAR NOT NULL,
        "fee_stroops" VARCHAR DEFAULT NULL,
        "ledger" INTEGER DEFAULT NULL,
        "error_message" VARCHAR DEFAULT NULL,
        "reference_id" VARCHAR NOT NULL,
        "confirmed_at" TIMESTAMPTZ DEFAULT NULL,
        CONSTRAINT "PK_blockchain_transactions" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_blockchain_transactions_tx_hash" ON "blockchain_transactions" ("tx_hash")`);
    await queryRunner.query(`CREATE INDEX "IDX_blockchain_transactions_user_id_created_at" ON "blockchain_transactions" ("user_id", "created_at" DESC)`);
    await queryRunner.query(`CREATE INDEX "IDX_blockchain_transactions_reference_id" ON "blockchain_transactions" ("reference_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_blockchain_transactions_status" ON "blockchain_transactions" ("status")`);
    await queryRunner.query(`ALTER TABLE "blockchain_transactions" ADD CONSTRAINT "FK_blockchain_transactions_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "blockchain_transactions" DROP CONSTRAINT "FK_blockchain_transactions_user"`);
    await queryRunner.query(`DROP INDEX "IDX_blockchain_transactions_status"`);
    await queryRunner.query(`DROP INDEX "IDX_blockchain_transactions_reference_id"`);
    await queryRunner.query(`DROP INDEX "IDX_blockchain_transactions_user_id_created_at"`);
    await queryRunner.query(`DROP INDEX "UQ_blockchain_transactions_tx_hash"`);
    await queryRunner.query(`DROP TABLE "blockchain_transactions"`);
    await queryRunner.query(`DROP TYPE "blockchain_transactions_status_enum"`);
    await queryRunner.query(`DROP TYPE "blockchain_transactions_type_enum"`);
  }
}
