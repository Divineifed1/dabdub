import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the admin_access_logs table.
 *
 * Design decisions:
 * - No foreign keys: maximises write throughput (append-only workload).
 * - Partitioned by month (RANGE) is an optional future optimisation noted
 *   in the comment below — left as a standard table for now to keep
 *   migration complexity low.
 * - Composite indexes on (admin_id, created_at) and (admin_id, resource_type)
 *   cover all query patterns in the service.
 */
export class CreateAdminAccessLogsTable1772300000000 implements MigrationInterface {
  name = 'CreateAdminAccessLogsTable1772300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "admin_access_logs" (
        "id"             UUID          NOT NULL DEFAULT uuid_generate_v4(),
        "admin_id"       UUID          NOT NULL,
        "session_id"     VARCHAR(255)  NOT NULL,
        "method"         VARCHAR(10)   NOT NULL,
        "path"           VARCHAR(500)  NOT NULL,
        "resource_type"  VARCHAR(100)  NOT NULL,
        "resource_id"    VARCHAR(255),
        "status_code"    INTEGER       NOT NULL,
        "duration_ms"    INTEGER       NOT NULL,
        "ip_address"     VARCHAR(100)  NOT NULL,
        "correlation_id" VARCHAR(100)  NOT NULL,
        "created_at"     TIMESTAMPTZ   NOT NULL DEFAULT now(),
        CONSTRAINT "PK_admin_access_logs" PRIMARY KEY ("id")
      )
    `);

    // Primary read patterns
    await queryRunner.query(`
      CREATE INDEX "IDX_aal_admin_created"
        ON "admin_access_logs" ("admin_id", "created_at" DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_aal_admin_resource"
        ON "admin_access_logs" ("admin_id", "resource_type")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_aal_session"
        ON "admin_access_logs" ("session_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_aal_created_at"
        ON "admin_access_logs" ("created_at" DESC)
    `);

    // Partial index for mutation detection (non-GET requests)
    await queryRunner.query(`
      CREATE INDEX "IDX_aal_mutations"
        ON "admin_access_logs" ("admin_id", "created_at" DESC)
        WHERE method != 'GET'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_aal_mutations"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_aal_created_at"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_aal_session"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_aal_admin_resource"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_aal_admin_created"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "admin_access_logs"`);
  }
}
