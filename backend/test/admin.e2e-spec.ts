import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { DataSource } from 'typeorm';
import {
  Merchant,
  MerchantStatus,
} from '../src/database/entities/merchant.entity';
import {
  Payment,
  PaymentStatus,
} from '../src/database/entities/payment.entity';
import {
  Settlement,
  SettlementStatus,
} from '../src/settlement/entities/settlement.entity';
import { User, UserRole } from '../src/database/entities/user.entity';

describe('Admin Controller (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let adminToken: string;
  let merchantToken: string;
  let testMerchant: Merchant;
  let testPayment: Payment;
  let testSettlement: Settlement;
  let adminUser: User;

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

    // Create test admin user
    const userRepo = dataSource.getRepository(User);
    adminUser = userRepo.create({
      email: 'admin@test.com',
      password: 'hashedPassword',
      role: UserRole.ADMIN,
      isEmailVerified: true,
    });
    await userRepo.save(adminUser);

    // Create test merchant user
    const merchantUser = userRepo.create({
      email: 'merchant@test.com',
      password: 'hashedPassword',
      role: UserRole.MERCHANT,
      isEmailVerified: true,
    });
    await userRepo.save(merchantUser);

    // Create test merchant
    const merchantRepo = dataSource.getRepository(Merchant);
    testMerchant = merchantRepo.create({
      userId: merchantUser.id,
      businessName: 'Test Business',
      email: 'merchant@test.com',
      status: MerchantStatus.ACTIVE,
      country: 'US',
      businessType: 'llc',
    });
    await merchantRepo.save(testMerchant);

    // Create test payment
    const paymentRepo = dataSource.getRepository(Payment);
    testPayment = paymentRepo.create({
      merchantId: testMerchant.id,
      amount: 100.0,
      currency: 'USD',
      status: PaymentStatus.PENDING,
      reference: 'TEST-PAY-001',
    });
    await paymentRepo.save(testPayment);

    // Create test settlement
    const settlementRepo = dataSource.getRepository(Settlement);
    testSettlement = settlementRepo.create({
      merchantId: testMerchant.id,
      amount: 100.0,
      currency: 'USD',
      status: SettlementStatus.FAILED,
      netAmount: 99.0,
      feeAmount: 1.0,
      retryCount: 1,
      maxRetries: 3,
    });
    await settlementRepo.save(testSettlement);

    // Get admin token (simplified - in real app, use proper auth flow)
    const adminLoginResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/admin/login')
      .send({
        email: 'admin@test.com',
        password: 'hashedPassword',
      });

    if (adminLoginResponse.body.accessToken) {
      adminToken = adminLoginResponse.body.accessToken;
    } else {
      // Fallback: create a mock token for testing
      adminToken = 'mock-admin-token';
    }

    // Get merchant token
    const merchantLoginResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: 'merchant@test.com',
        password: 'hashedPassword',
      });

    if (merchantLoginResponse.body.accessToken) {
      merchantToken = merchantLoginResponse.body.accessToken;
    } else {
      merchantToken = 'mock-merchant-token';
    }
  });

  afterAll(async () => {
    // Cleanup
    if (dataSource && dataSource.isInitialized) {
      await dataSource.getRepository(Settlement).delete({});
      await dataSource.getRepository(Payment).delete({});
      await dataSource.getRepository(Merchant).delete({});
      await dataSource.getRepository(User).delete({});
      await dataSource.destroy();
    }
    await app.close();
  });

  describe('GET /api/v1/admin/merchants', () => {
    it('should return list of merchants for admin', () => {
      return request(app.getHttpServer())
        .get('/api/v1/admin/merchants')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('data');
          expect(res.body).toHaveProperty('meta');
          expect(Array.isArray(res.body.data)).toBe(true);
        });
    });

    it('should filter merchants by status', () => {
      return request(app.getHttpServer())
        .get('/api/v1/admin/merchants')
        .query({ status: MerchantStatus.ACTIVE })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)
        .expect((res) => {
          expect(
            res.body.data.every((m: any) => m.status === MerchantStatus.ACTIVE),
          ).toBe(true);
        });
    });

    it('should search merchants by business name', () => {
      return request(app.getHttpServer())
        .get('/api/v1/admin/merchants')
        .query({ search: 'Test' })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });

    it('should deny access to non-admin users', () => {
      return request(app.getHttpServer())
        .get('/api/v1/admin/merchants')
        .set('Authorization', `Bearer ${merchantToken}`)
        .expect(403);
    });
  });

  describe('GET /api/v1/admin/merchants/:id', () => {
    it('should return merchant details with stats', () => {
      return request(app.getHttpServer())
        .get(`/api/v1/admin/merchants/${testMerchant.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('id', testMerchant.id);
          expect(res.body).toHaveProperty('businessName');
          expect(res.body).toHaveProperty('stats');
          expect(res.body.stats).toHaveProperty('paymentCount');
          expect(res.body.stats).toHaveProperty('totalVolume');
        });
    });

    it('should return 404 for non-existent merchant', () => {
      return request(app.getHttpServer())
        .get('/api/v1/admin/merchants/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });
  });

  describe('PUT /api/v1/admin/merchants/:id/status', () => {
    it('should update merchant status', () => {
      return request(app.getHttpServer())
        .put(`/api/v1/admin/merchants/${testMerchant.id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          status: MerchantStatus.SUSPENDED,
          reason: 'Test suspension',
        })
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('status', MerchantStatus.SUSPENDED);
        });
    });

    it('should validate status enum', () => {
      return request(app.getHttpServer())
        .put(`/api/v1/admin/merchants/${testMerchant.id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          status: 'INVALID_STATUS',
        })
        .expect(400);
    });

    it('should create audit log for status change', async () => {
      await request(app.getHttpServer())
        .put(`/api/v1/admin/merchants/${testMerchant.id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          status: MerchantStatus.ACTIVE,
          reason: 'Reactivation',
        })
        .expect(200);

      // Verify audit log was created
      const auditLogs = await request(app.getHttpServer())
        .get('/api/v1/admin/audit-logs')
        .query({ entityId: testMerchant.id, entityType: 'Merchant' })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(auditLogs.body.data.length).toBeGreaterThan(0);
    });
  });

  describe('GET /api/v1/admin/payments', () => {
    it('should return list of all payments', () => {
      return request(app.getHttpServer())
        .get('/api/v1/admin/payments')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('data');
          expect(res.body).toHaveProperty('meta');
          expect(Array.isArray(res.body.data)).toBe(true);
        });
    });

    it('should filter payments by merchant', () => {
      return request(app.getHttpServer())
        .get('/api/v1/admin/payments')
        .query({ merchantId: testMerchant.id })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)
        .expect((res) => {
          expect(
            res.body.data.every((p: any) => p.merchantId === testMerchant.id),
          ).toBe(true);
        });
    });

    it('should filter payments by status', () => {
      return request(app.getHttpServer())
        .get('/api/v1/admin/payments')
        .query({ status: PaymentStatus.PENDING })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });

    it('should filter payments by date range', () => {
      const fromDate = new Date('2024-01-01').toISOString();
      const toDate = new Date().toISOString();

      return request(app.getHttpServer())
        .get('/api/v1/admin/payments')
        .query({ fromDate, toDate })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });

    it('should search payments by reference', () => {
      return request(app.getHttpServer())
        .get('/api/v1/admin/payments')
        .query({ search: 'TEST' })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });
  });

  describe('POST /api/v1/admin/settlements/:id/retry', () => {
    it('should retry failed settlement', () => {
      return request(app.getHttpServer())
        .post(`/api/v1/admin/settlements/${testSettlement.id}/retry`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('status', SettlementStatus.PENDING);
          expect(res.body).toHaveProperty('retryCount', 0);
        });
    });

    it('should not retry non-failed settlement', async () => {
      // Create a completed settlement
      const settlementRepo = dataSource.getRepository(Settlement);
      const completedSettlement = settlementRepo.create({
        merchantId: testMerchant.id,
        amount: 50.0,
        currency: 'USD',
        status: SettlementStatus.COMPLETED,
        netAmount: 49.5,
        feeAmount: 0.5,
      });
      await settlementRepo.save(completedSettlement);

      return request(app.getHttpServer())
        .post(`/api/v1/admin/settlements/${completedSettlement.id}/retry`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);
    });

    it('should return 404 for non-existent settlement', () => {
      return request(app.getHttpServer())
        .post(
          '/api/v1/admin/settlements/00000000-0000-0000-0000-000000000000/retry',
        )
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });
  });

  describe('GET /api/v1/admin/system/health', () => {
    it('should return comprehensive system health', () => {
      return request(app.getHttpServer())
        .get('/api/v1/admin/system/health')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('status');
          expect(res.body).toHaveProperty('info');
          expect(res.body).toHaveProperty('details');
        });
    });
  });

  describe('GET /api/v1/admin/system/metrics', () => {
    it('should return platform metrics', () => {
      return request(app.getHttpServer())
        .get('/api/v1/admin/system/metrics')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('merchants');
          expect(res.body).toHaveProperty('payments');
          expect(res.body).toHaveProperty('settlements');
          expect(res.body).toHaveProperty('timestamp');
          expect(res.body.merchants).toHaveProperty('total');
          expect(res.body.merchants).toHaveProperty('active');
        });
    });
  });

  describe('GET /api/v1/admin/audit-logs', () => {
    it('should return audit logs', () => {
      return request(app.getHttpServer())
        .get('/api/v1/admin/audit-logs')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('data');
          expect(res.body).toHaveProperty('meta');
          expect(Array.isArray(res.body.data)).toBe(true);
        });
    });

    it('should filter audit logs by entity type', () => {
      return request(app.getHttpServer())
        .get('/api/v1/admin/audit-logs')
        .query({ entityType: 'Merchant' })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });

    it('should filter audit logs by actor', () => {
      return request(app.getHttpServer())
        .get('/api/v1/admin/audit-logs')
        .query({ actorId: adminUser.id })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });

    it('should filter audit logs by date range', () => {
      const startDate = new Date('2024-01-01').toISOString();
      const endDate = new Date().toISOString();

      return request(app.getHttpServer())
        .get('/api/v1/admin/audit-logs')
        .query({ startDate, endDate })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });
  });

  describe('POST /api/v1/admin/manual-reconciliation', () => {
    it('should perform manual reconciliation for payment', () => {
      return request(app.getHttpServer())
        .post('/api/v1/admin/manual-reconciliation')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          type: 'payment',
          entityId: testPayment.id,
          reason: 'Manual reconciliation test',
          notes: 'Test notes',
        })
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('success', true);
          expect(res.body).toHaveProperty('entityType', 'Payment');
          expect(res.body).toHaveProperty('reconciledAt');
        });
    });

    it('should perform manual reconciliation for settlement', () => {
      return request(app.getHttpServer())
        .post('/api/v1/admin/manual-reconciliation')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          type: 'settlement',
          entityId: testSettlement.id,
          reason: 'Settlement reconciliation',
          adjustmentAmount: 1.5,
        })
        .expect(200);
    });

    it('should validate reconciliation type', () => {
      return request(app.getHttpServer())
        .post('/api/v1/admin/manual-reconciliation')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          type: 'invalid_type',
          entityId: testPayment.id,
          reason: 'Test',
        })
        .expect(400);
    });

    it('should return 404 for non-existent entity', () => {
      return request(app.getHttpServer())
        .post('/api/v1/admin/manual-reconciliation')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          type: 'payment',
          entityId: '00000000-0000-0000-0000-000000000000',
          reason: 'Test',
        })
        .expect(404);
    });
  });

  describe('Admin Authorization', () => {
    it('should deny access without token', () => {
      return request(app.getHttpServer())
        .get('/api/v1/admin/merchants')
        .expect(401);
    });

    it('should deny access with merchant token', () => {
      return request(app.getHttpServer())
        .get('/api/v1/admin/merchants')
        .set('Authorization', `Bearer ${merchantToken}`)
        .expect(403);
    });

    it('should allow access with admin token', () => {
      return request(app.getHttpServer())
        .get('/api/v1/admin/merchants')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });
  });
});
