import { DataSource } from 'typeorm';
import { AdminUser, AdminRole, AdminStatus } from '../entities/admin-user.entity';
import { PasswordService } from '../../auth/services/password.service';

/**
 * Seeds the admin_users table (v1 admin auth).
 * Set SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD (or ADMIN_V1_EMAIL / ADMIN_V1_PASSWORD) to create an initial admin.
 */
export class AdminUserV1Seeder {
  static async seed(dataSource: DataSource): Promise<void> {
    const email =
      process.env.ADMIN_V1_EMAIL ||
      process.env.SUPER_ADMIN_EMAIL;
    const password =
      process.env.ADMIN_V1_PASSWORD ||
      process.env.SUPER_ADMIN_PASSWORD;

    if (!email || !password) {
      console.warn(
        '⚠  ADMIN_V1_EMAIL/ADMIN_V1_PASSWORD (or SUPER_ADMIN_*) not set — skipping admin_users seed',
      );
      return;
    }

    const repo = dataSource.getRepository(AdminUser);
    const existing = await repo
      .createQueryBuilder('a')
      .where('LOWER(a.email) = LOWER(:email)', { email })
      .getOne();

    if (existing) {
      console.log(`  - Admin user (v1) already exists: ${email}`);
      return;
    }

    const passwordService = new PasswordService();
    const passwordHash = await passwordService.hashPasswordForAdmin(password);

    const admin = repo.create({
      email: email.toLowerCase(),
      passwordHash,
      firstName: 'Super',
      lastName: 'Admin',
      role: AdminRole.SUPER_ADMIN,
      status: AdminStatus.ACTIVE,
      twoFactorEnabled: false,
      twoFactorSecret: null,
      failedLoginAttempts: 0,
      lockedUntil: null,
      lastLoginAt: null,
      lastLoginIp: null,
      createdById: null,
    });

    await repo.save(admin);
    console.log(`  ✓ Created admin user (v1): ${email}`);
  }
}
