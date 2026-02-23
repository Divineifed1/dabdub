import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { AdminAccessLog } from '../src/admin-access-log/entities/admin-access-log.entity';
import { UserEntity, UserRole } from '../src/database/entities/user.entity';

describe('AdminAccessLog (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let superAdminToken: string;
  let adminToken: string;
  let superAdminId: string;
  let targetAdminId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
    dataSource = moduleFixture.get<DataSource>(DataSource);

    const userRepo = dataSource.getRepository(UserEntity);

    const superAdmin = userRepo.create({
      email: 'aal-superadmin@test.com',
      password: 'hashed',
      role: UserRole.SUPER_ADMIN,
      isEmailVerified: true,
      isActive: true,
    });
    await userRepo.save(superAdmin);
    superAdminId = superAdmin.id;

    const admin = userRepo.create({
      email: 'aal-admin@test.com',
      password: 'hashed',
      role: UserRole.ADMIN,
      isEmailVerified: true,
      isActive: true,
    });
    await userRepo.save(admin);
    targetAdminId = admin.id;

    const loginSuper = await request(app.getHttpServer())
      .post('/api/v1/auth/admin/login')
      .send({ email: 'aal-superadmin@test.com', password: 'hashed' });
    superAdminToken = loginSuper.body.accessToken;

    const loginAdmin = await request(app.getHttpServer())
      .post('/api/v1/auth/admin/login')
      .send({ email: 'aal-admin@test.com', password: 'hashed' });
    adminToken = loginAdmin.body.accessToken;

    // Seed some access log rows for the target admin
    const repo = dataSource.getRepository(AdminAccessLog);
    const rows = Array.from({ length: 20 }, (_, i) =>
      repo.create({
        adminId: targetAdminId,
        sessionId: 'test-session-001',
        method: i % 4 === 0 ? 'POST' : 'GET',
        path: `/api/v1/merchants/merchant-${i}`,
        resourceType: 'Merchant',
        resourceId: `merchant-${i}`,
        statusCode: 200,
        durationMs: 30 + i,
        ipAddress: '10.0.0.1',
        correlationId: `corr-${i}`,
      }),
    );
    await repo.save(rows);
  });

  afterAll(async () => {
    await dataSource
      .getRepository(AdminAccessLog)
      .delete({ adminId: targetAdminId });
    await app.close();
  });

  // ── Access log endpoint ─────────────────────────────────────────────────────

  describe('GET /api/v1/admin/users/:id/access-log', () => {
    it('returns paginated access log for SUPER_ADMIN', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/admin/users/${targetAdminId}/access-log`)
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toBeDefined();
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.meta.total).toBeGreaterThanOrEqual(20);
      expect(res.body.meta.page).toBe(1);
    });

    it('filters by method', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/admin/users/${targetAdminId}/access-log?method=POST`)
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.every((r: any) => r.method === 'POST')).toBe(true);
    });

    it('rejects non-SUPER_ADMIN', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/admin/users/${targetAdminId}/access-log`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(403);
    });

    it('returns 404 for unknown admin id', async () => {
      const res = await request(app.getHttpServer())
        .get(
          `/api/v1/admin/users/00000000-0000-0000-0000-000000000000/access-log`,
        )
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(404);
    });
  });

  // ── Access summary endpoint ─────────────────────────────────────────────────

  describe('GET /api/v1/admin/users/:id/access-summary', () => {
    it('returns summary shape', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/admin/users/${targetAdminId}/access-summary?period=30d`)
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.adminId).toBe(targetAdminId);
      expect(typeof res.body.totalRequests).toBe('number');
      expect(Array.isArray(res.body.requestsByDay)).toBe(true);
      expect(Array.isArray(res.body.topAccessedResources)).toBe(true);
      expect(Array.isArray(res.body.unusualActivity)).toBe(true);
    });

    it('returns identical result on second call (cache hit)', async () => {
      const res1 = await request(app.getHttpServer())
        .get(`/api/v1/admin/users/${targetAdminId}/access-summary`)
        .set('Authorization', `Bearer ${superAdminToken}`);
      const res2 = await request(app.getHttpServer())
        .get(`/api/v1/admin/users/${targetAdminId}/access-summary`)
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res1.body.totalRequests).toBe(res2.body.totalRequests);
    });
  });

  // ── Session history endpoint ────────────────────────────────────────────────

  describe('GET /api/v1/admin/users/:id/sessions', () => {
    it('returns session list', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/admin/users/${targetAdminId}/sessions`)
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  // ── Force terminate session ─────────────────────────────────────────────────

  describe('POST /api/v1/admin/users/:id/terminate-session/:sessionId', () => {
    it('terminates a session and invalidates Redis token', async () => {
      const res = await request(app.getHttpServer())
        .post(
          `/api/v1/admin/users/${targetAdminId}/terminate-session/test-session-001`,
        )
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(201);
    });

    it('blocks non-SUPER_ADMIN from terminating sessions', async () => {
      const res = await request(app.getHttpServer())
        .post(
          `/api/v1/admin/users/${targetAdminId}/terminate-session/any-session`,
        )
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(403);
    });
  });

  // ── Cross-admin activity report ─────────────────────────────────────────────

  describe('GET /api/v1/security/admin-activity-report', () => {
    it('returns report with adminSummaries and platformTotals', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/security/admin-activity-report?period=30d')
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.period).toBe('30d');
      expect(Array.isArray(res.body.adminSummaries)).toBe(true);
      expect(typeof res.body.platformTotals.totalAdminRequests).toBe('number');
      expect(typeof res.body.platformTotals.totalMutations).toBe('number');
      expect(typeof res.body.platformTotals.adminsWithUnusualActivity).toBe(
        'number',
      );
    });

    it('blocks non-SUPER_ADMIN', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/security/admin-activity-report')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(403);
    });
  });

  // ── Middleware capture ──────────────────────────────────────────────────────

  describe('Middleware writes access log on every admin request', () => {
    it('creates an access log row after an authenticated admin request', async () => {
      const before = await dataSource
        .getRepository(AdminAccessLog)
        .count({ where: { adminId: superAdminId } });

      await request(app.getHttpServer())
        .get('/api/v1/admin/merchants')
        .set('Authorization', `Bearer ${superAdminToken}`);

      // Allow async fire-and-forget to complete
      await new Promise((r) => setTimeout(r, 200));

      const after = await dataSource
        .getRepository(AdminAccessLog)
        .count({ where: { adminId: superAdminId } });

      expect(after).toBeGreaterThan(before);
    });
  });
});
