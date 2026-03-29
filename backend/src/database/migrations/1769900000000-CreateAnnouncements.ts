import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAnnouncements1769900000000 implements MigrationInterface {
  name = 'CreateAnnouncements1769900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "announcement_type_enum" AS ENUM (
        'info', 'warning', 'critical', 'promo'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE "announcement_target_audience_enum" AS ENUM (
        'all', 'silver', 'gold', 'black', 'merchants', 'unverified'
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "announcements" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "title" character varying(100) NOT NULL,
        "body" text NOT NULL,
        "type" "announcement_type_enum" NOT NULL,
        "target_audience" "announcement_target_audience_enum" NOT NULL DEFAULT 'all',
        "cta_label" character varying(50),
        "cta_url" character varying,
        "is_dismissible" boolean NOT NULL DEFAULT true,
        "show_from" TIMESTAMPTZ NOT NULL,
        "show_until" TIMESTAMPTZ NOT NULL,
        "created_by" uuid NOT NULL,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_announcements_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "announcement_dismissals" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "announcement_id" uuid NOT NULL,
        "dismissed_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_announcement_dismissals_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_announcement_dismissals_user_announcement"
          UNIQUE ("user_id", "announcement_id"),
        CONSTRAINT "FK_announcement_dismissals_announcement_id"
          FOREIGN KEY ("announcement_id") REFERENCES "announcements"("id")
          ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_announcements_active_window"
      ON "announcements" ("is_active", "show_from", "show_until")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_announcement_dismissals_user_announcement"
      ON "announcement_dismissals" ("user_id", "announcement_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_announcement_dismissals_user_announcement"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_announcements_active_window"
    `);
    await queryRunner.query(`
      DROP TABLE IF EXISTS "announcement_dismissals"
    `);
    await queryRunner.query(`
      DROP TABLE IF EXISTS "announcements"
    `);
    await queryRunner.query(`
      DROP TYPE IF EXISTS "announcement_target_audience_enum"
    `);
    await queryRunner.query(`
      DROP TYPE IF EXISTS "announcement_type_enum"
    `);
  }
}
