import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { HealthModule } from '../src/health/health.module';
import { GlobalConfigModule } from '../src/config/config.module';
import { JwtGuard } from '../src/auth/guards/jwt.guard'; // I will check this path next

import { BlockchainHealthIndicator } from '../src/health/indicators/blockchain.health';
import { RedisHealthIndicator } from '../src/health/indicators/redis.health';
import { TypeOrmHealthIndicator } from '@nestjs/terminus';

// Mock dependencies to avoid actual external connections in test
jest.mock('../src/database/database.module');

describe('HealthController (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [GlobalConfigModule, HealthModule],
    })
      .overrideProvider(BlockchainHealthIndicator)
      .useValue({ isHealthy: () => ({ blockchain: { status: 'up' } }) })
      .overrideProvider(RedisHealthIndicator)
      .useValue({ isHealthy: () => ({ redis: { status: 'up' } }) })
      .overrideProvider(TypeOrmHealthIndicator)
      .useValue({ pingCheck: () => ({ database: { status: 'up' } }) })
      .overrideGuard(JwtGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('/health (GET)', () => {
    return request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect((res) => {
        expect(res.body.status).toBeDefined();
      });
  });

  it('/health/ready (GET)', () => {
    return request(app.getHttpServer()).get('/health/ready').expect(200);
  });

  it('/health/live (GET)', () => {
    return request(app.getHttpServer()).get('/health/live').expect(200);
  });

  it('/health/version (GET)', () => {
    return request(app.getHttpServer())
      .get('/health/version')
      .expect(200)
      .expect((res) => {
        expect(res.body.version).toBeDefined();
      });
  });
});
