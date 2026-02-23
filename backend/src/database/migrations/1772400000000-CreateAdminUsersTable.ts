import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAdminUsersTable1772400000000 implements MigrationInterface {
  name = 'CreateAdminUsersTable1772400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "admin_users_role_enum" AS ENUM (
        'READONLY_ADMIN', 'SUPPORT_ADMIN', 'OPERATIONS_ADMIN',
        'FINANCE_ADMIN', 'SUPER_ADMIN'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE "admin_users_status_enum" AS ENUM (
        'ACTIVE', 'SUSPENDED', 'LOCKED', 'PENDING_SETUP'
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "admin_users" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMPTZ,
        "email" varchar(255) NOT NULL,
        "passwordHash" varchar NOT NULL,
        "firstName" varchar(100) NOT NULL,
        "lastName" varchar(100) NOT NULL,
        "role" "admin_users_role_enum" NOT NULL DEFAULT 'READONLY_ADMIN',
        "status" "admin_users_status_enum" NOT NULL DEFAULT 'ACTIVE',
        "twoFactorEnabled" boolean NOT NULL DEFAULT false,
        "twoFactorSecret" varchar,
        "failedLoginAttempts" integer NOT NULL DEFAULT 0,
        "lockedUntil" TIMESTAMPTZ,
        "lastLoginAt" TIMESTAMPTZ,
        "lastLoginIp" varchar,
        "createdById" uuid,
        CONSTRAINT "UQ_admin_users_email" UNIQUE ("email"),
        CONSTRAINT "PK_admin_users" PRIMARY KEY ("id"),
        CONSTRAINT "FK_admin_users_createdBy" FOREIGN KEY ("createdById") REFERENCES "admin_users"("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_admin_users_email" ON "admin_users" ("email")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_admin_users_status" ON "admin_users" ("status")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "admin_users"`);
    await queryRunner.query(`DROP TYPE "admin_users_status_enum"`);
    await queryRunner.query(`DROP TYPE "admin_users_role_enum"`);
  }
}
