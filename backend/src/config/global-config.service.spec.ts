import { Test, TestingModule } from '@nestjs/testing';
import { GlobalConfigService } from './global-config.service';
import { GlobalConfigModule } from './config.module';

describe('GlobalConfigService', () => {
  let service: GlobalConfigService;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [GlobalConfigModule],
    }).compile();

    service = module.get<GlobalConfigService>(GlobalConfigService);
  });

  describe('App Configuration', () => {
    it('should return app configuration', () => {
      const config = service.getAppConfig();
      expect(config).toBeDefined();
      expect(config.nodeEnv).toBeDefined();
    });

    it('should return node environment', () => {
      const env = service.getNodeEnv();
      expect(env).toBeDefined();
      expect(['development', 'staging', 'production']).toContain(env);
    });

    it('should return port number', () => {
      const port = service.getPort();
      expect(typeof port).toBe('number');
      expect(port).toBeGreaterThan(0);
    });

    it('should identify development environment', () => {
      // Default environment is development
      expect(service.isDevelopment()).toBe(true);
    });

    it('should identify debug mode', () => {
      const debug = service.isDebugEnabled();
      expect(typeof debug).toBe('boolean');
    });
  });

  describe('Database Configuration', () => {
    it('should return database configuration', () => {
      const config = service.getDatabaseConfig();
      expect(config).toBeDefined();
      expect(config.host).toBeDefined();
      expect(config.port).toBeDefined();
      expect(config.username).toBeDefined();
      expect(config.database).toBeDefined();
      expect(config.poolSize).toBeGreaterThan(0);
    });

    it('should return consistent database config', () => {
      const config1 = service.getDatabaseConfig();
      const config2 = service.getDatabaseConfig();
      expect(config1).toBe(config2); // Should be cached
    });
  });

  describe('Blockchain Configuration', () => {
    it('should return blockchain configuration', () => {
      const config = service.getBlockchainConfig();
      expect(config).toBeDefined();
    });

    it('should handle missing RPC endpoint gracefully', () => {
      expect(() => service.getRpcEndpoint()).toThrow();
    });

    it('should handle missing settlement private key gracefully', () => {
      expect(() => service.getSettlementPrivateKey()).toThrow();
    });
  });

  describe('API Configuration', () => {
    it('should return API configuration', () => {
      const config = service.getApiConfig();
      expect(config).toBeDefined();
    });

    it('should return JWT expiry with default value', () => {
      const expiry = service.getJwtExpiry();
      expect(expiry).toBeDefined();
      expect(typeof expiry).toBe('string');
    });

    it('should handle missing JWT secret gracefully', () => {
      expect(() => service.getJwtSecret()).toThrow();
    });
  });

  describe('Configuration Summary', () => {
    it('should return configuration summary', () => {
      const summary = service.getConfigSummary();
      expect(summary).toBeDefined();
      expect(summary.environment).toBeDefined();
      expect(summary.port).toBeDefined();
      expect(summary.database).toBeDefined();
      expect(summary.blockchain).toBeDefined();
      expect(summary.api).toBeDefined();
    });
  });

  describe('Cache Management', () => {
    it('should clear cache', () => {
      const config1 = service.getDatabaseConfig();
      service.clearCache();
      const config2 = service.getDatabaseConfig();
      // Different object references after cache clear
      expect(config1).not.toBe(config2);
    });
  });
});
