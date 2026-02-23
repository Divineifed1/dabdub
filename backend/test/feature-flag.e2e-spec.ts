import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { FeatureFlag } from '../src/feature-flag/entities/feature-flag.entity';
import { RolloutStrategy } from '../src/feature-flag/enums/feature-flag.enums';
import { Merchant } from '../src/merchant/entities/merchant.entity';
import { MerchantTier } from '../src/merchant/dto/merchant.dto';
import { UserEntity, UserRole } from '../src/database/entities/user.entity';

describe('FeatureFlag (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let adminToken: string;
  let superAdminToken: string;
  let testMerchantId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    dataSource = moduleFixture.get<DataSource>(DataSource);

    const userRepo = dataSource.getRepository(UserEntity);
    const merchantRepo = dataSource.getRepository(Merchant);

    // Seed admin + super-admin users
    const admin = userRepo.create({
      email: 'ff-admin@test.com',
      password: 'hashed',
      role: UserRole.ADMIN,
      isEmailVerified: true,
    });
    await userRepo.save(admin);

    const superAdmin = userRepo.create({
      email: 'ff-superadmin@test.com',
      password: 'hashed',
      role: UserRole.SUPER_ADMIN,
      isEmailVerified: true,
    });
    await userRepo.save(superAdmin);

    const merchant = merchantRepo.create({
      email: 'ff-merchant@test.com',
      businessName: 'Test Biz',
      status: 'active',
      tier: MerchantTier.GROWTH,
    });
    await merchantRepo.save(merchant);
    testMerchantId = merchant.id;

    // Obtain tokens via login endpoint
    const adminLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/admin/login')
      .send({ email: 'ff-admin@test.com', password: 'hashed' });
    adminToken = adminLogin.body.accessToken;

    const superAdminLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/admin/login')
      .send({ email: 'ff-superadmin@test.com', password: 'hashed' });
    superAdminToken = superAdminLogin.body.accessToken;
  });

  afterAll(async () => {
    await dataSource.getRepository(FeatureFlag).delete({});
    await app.close();
  });

  // ── Create flag ─────────────────────────────────────────────────────────────

  describe('POST /api/v1/feature-flags', () => {
    it('creates a flag successfully', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/feature-flags')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          flagKey: 'new_settlement_engine',
          displayName: 'New Settlement Engine',
          description:
            'Enables the revamped settlement processing engine for testing.',
          rolloutStrategy: RolloutStrategy.PERCENTAGE,
          rolloutPercentage: 45.3,
          isEnabled: true,
          isKillSwitch: false,
        });

      expect(res.status).toBe(201);
      expect(res.body.flagKey).toBe('new_settlement_engine');
      expect(res.body.rolloutStrategy).toBe(RolloutStrategy.PERCENTAGE);
    });

    it('rejects flagKey with invalid characters', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/feature-flags')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          flagKey: 'InvalidKey123',
          displayName: 'Bad Key',
          description: 'This should fail due to invalid flagKey format.',
          rolloutStrategy: RolloutStrategy.ALL,
          isEnabled: false,
          isKillSwitch: false,
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toEqual(
        expect.arrayContaining([
          expect.stringContaining('lowercase letters and underscores'),
        ]),
      );
    });

    it('rejects duplicate flagKey', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/feature-flags')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          flagKey: 'new_settlement_engine',
          displayName: 'Duplicate',
          description: 'This should fail because the flagKey already exists.',
          rolloutStrategy: RolloutStrategy.ALL,
          isEnabled: false,
          isKillSwitch: false,
        });

      expect(res.status).toBe(409);
    });
  });

  // ── List flags ──────────────────────────────────────────────────────────────

  describe('GET /api/v1/feature-flags', () => {
    it('returns flag list', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/feature-flags')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(
        res.body.some((f: any) => f.flagKey === 'new_settlement_engine'),
      ).toBe(true);
    });
  });

  // ── Evaluate flag for merchant ──────────────────────────────────────────────

  describe('GET /api/v1/feature-flags/:flagKey/evaluate/:merchantId', () => {
    it('returns deterministic evaluation for PERCENTAGE strategy', async () => {
      const res1 = await request(app.getHttpServer())
        .get(
          `/api/v1/feature-flags/new_settlement_engine/evaluate/${testMerchantId}`,
        )
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res1.status).toBe(200);
      expect(res1.body.flagKey).toBe('new_settlement_engine');
      expect(typeof res1.body.isEnabled).toBe('boolean');
      expect(res1.body.reason).toMatch(/PERCENTAGE/);

      // Same merchant → same result (determinism)
      const res2 = await request(app.getHttpServer())
        .get(
          `/api/v1/feature-flags/new_settlement_engine/evaluate/${testMerchantId}`,
        )
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res2.body.isEnabled).toBe(res1.body.isEnabled);
    });
  });

  // ── Per-merchant overrides ──────────────────────────────────────────────────

  describe('POST /api/v1/feature-flags/:flagKey/override', () => {
    it('sets a force-ON override for a merchant', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/feature-flags/new_settlement_engine/override')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          merchantId: testMerchantId,
          enabled: true,
          reason: 'QA testing override',
        });

      expect(res.status).toBe(201);
    });

    it('override takes precedence over rollout strategy', async () => {
      const res = await request(app.getHttpServer())
        .get(
          `/api/v1/feature-flags/new_settlement_engine/evaluate/${testMerchantId}`,
        )
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.body.isEnabled).toBe(true);
      expect(res.body.reason).toBe('OVERRIDE_ON');
    });
  });

  describe('DELETE /api/v1/feature-flags/:flagKey/override/:merchantId', () => {
    it('removes the override', async () => {
      const res = await request(app.getHttpServer())
        .delete(
          `/api/v1/feature-flags/new_settlement_engine/override/${testMerchantId}`,
        )
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('Override removed');
    });
  });

  // ── Kill-switch protection ──────────────────────────────────────────────────

  describe('Kill-switch flag access control', () => {
    beforeAll(async () => {
      await request(app.getHttpServer())
        .post('/api/v1/feature-flags')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          flagKey: 'emergency_kill_starknet',
          displayName: 'Emergency Kill: StarkNet',
          description:
            'Kill switch to instantly disable all StarkNet chain activity.',
          rolloutStrategy: RolloutStrategy.ALL,
          isEnabled: true,
          isKillSwitch: true,
        });
    });

    it('blocks a non-SUPER_ADMIN from toggling a kill-switch flag', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/v1/feature-flags/emergency_kill_starknet')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ isEnabled: false });

      expect(res.status).toBe(403);
    });

    it('allows SUPER_ADMIN to toggle a kill-switch flag', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/v1/feature-flags/emergency_kill_starknet')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ isEnabled: false });

      expect(res.status).toBe(200);
      expect(res.body.isEnabled).toBe(false);
    });
  });

  // ── Merchant-scoped endpoint ────────────────────────────────────────────────

  describe('GET /api/v1/merchants/:id/feature-flags', () => {
    it('returns evaluations for all flags for a merchant', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/merchants/${testMerchantId}/feature-flags`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.merchantId).toBe(testMerchantId);
      expect(Array.isArray(res.body.evaluations)).toBe(true);
    });
  });
});
