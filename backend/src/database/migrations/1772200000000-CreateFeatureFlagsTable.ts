import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateFeatureFlagsTable1772200000000 implements MigrationInterface {
  name = 'CreateFeatureFlagsTable1772200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Enum
    await queryRunner.query(`
      CREATE TYPE "public"."feature_flags_rollout_strategy_enum" AS ENUM(
        'ALL', 'PERCENTAGE', 'MERCHANT_IDS', 'MERCHANT_TIERS', 'COUNTRIES'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "feature_flags" (
        "id"                       UUID              NOT NULL DEFAULT uuid_generate_v4(),
        "created_at"               TIMESTAMPTZ       NOT NULL DEFAULT now(),
        "updated_at"               TIMESTAMPTZ       NOT NULL DEFAULT now(),
        "deleted_at"               TIMESTAMPTZ,
        "flag_key"                 VARCHAR           NOT NULL,
        "display_name"             VARCHAR           NOT NULL,
        "description"              TEXT              NOT NULL,
        "is_enabled"               BOOLEAN           NOT NULL DEFAULT false,
        "rollout_strategy"         "public"."feature_flags_rollout_strategy_enum"
                                                     NOT NULL DEFAULT 'ALL',
        "rollout_percentage"       NUMERIC(5,2),
        "target_merchant_ids"      JSONB,
        "target_tiers"             JSONB,
        "target_countries"         JSONB,
        "overridden_merchant_ids"  JSONB             NOT NULL DEFAULT '[]',
        "overrides"                JSONB             NOT NULL DEFAULT '{}',
        "is_kill_switch"           BOOLEAN           NOT NULL DEFAULT false,
        "last_changed_by_id"       UUID,
        CONSTRAINT "PK_feature_flags" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_feature_flags_flag_key" UNIQUE ("flag_key")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_feature_flags_flag_key"   ON "feature_flags" ("flag_key")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_feature_flags_is_enabled" ON "feature_flags" ("is_enabled")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_feature_flags_deleted_at" ON "feature_flags" ("deleted_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_feature_flags_deleted_at"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_feature_flags_is_enabled"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_feature_flags_flag_key"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "feature_flags"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."feature_flags_rollout_strategy_enum"`,
    );
  }
}
