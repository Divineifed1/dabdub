import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { CryptoService } from './crypto.service';

describe('CryptoService', () => {
  let service: CryptoService;
  let configService: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CryptoService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'ENCRYPTION_KEY') {
                return 'test-encryption-key-for-unit-tests';
              }
              return null;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<CryptoService>(CryptoService);
    configService = module.get<ConfigService>(ConfigService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('encrypt and decrypt', () => {
    it('should encrypt and decrypt text correctly', () => {
      const plaintext = 'my-secret-totp-key';
      const encrypted = service.encrypt(plaintext);
      
      expect(encrypted).toBeDefined();
      expect(encrypted).toContain(':');
      expect(encrypted.split(':')).toHaveLength(3);
      
      const decrypted = service.decrypt(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it('should produce different ciphertexts for same plaintext', () => {
      const plaintext = 'my-secret-totp-key';
      const encrypted1 = service.encrypt(plaintext);
      const encrypted2 = service.encrypt(plaintext);
      
      expect(encrypted1).not.toBe(encrypted2);
      
      // But both should decrypt to same plaintext
      expect(service.decrypt(encrypted1)).toBe(plaintext);
      expect(service.decrypt(encrypted2)).toBe(plaintext);
    });

    it('should throw error for invalid ciphertext format', () => {
      expect(() => service.decrypt('invalid-format')).toThrow('Decryption failed');
    });

    it('should throw error for tampered ciphertext', () => {
      const plaintext = 'my-secret-totp-key';
      const encrypted = service.encrypt(plaintext);
      const tampered = encrypted.replace(/.$/, 'X'); // Change last character
      
      expect(() => service.decrypt(tampered)).toThrow('Decryption failed');
    });
  });

  describe('generateBackupCodes', () => {
    it('should generate 10 backup codes by default', () => {
      const codes = service.generateBackupCodes();
      
      expect(codes).toHaveLength(10);
      codes.forEach(code => {
        expect(code).toMatch(/^[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}$/);
      });
    });

    it('should generate specified number of backup codes', () => {
      const codes = service.generateBackupCodes(5);
      
      expect(codes).toHaveLength(5);
    });

    it('should generate unique backup codes', () => {
      const codes = service.generateBackupCodes(20);
      const uniqueCodes = new Set(codes);
      
      expect(uniqueCodes.size).toBe(20);
    });
  });

  describe('hashBackupCode and verifyBackupCode', () => {
    it('should hash and verify backup code correctly', async () => {
      const code = 'ABCD-EFGH-IJKL';
      const hash = await service.hashBackupCode(code);
      
      expect(hash).toBeDefined();
      expect(hash).not.toBe(code);
      
      const isValid = await service.verifyBackupCode(code, hash);
      expect(isValid).toBe(true);
    });

    it('should reject invalid backup code', async () => {
      const code = 'ABCD-EFGH-IJKL';
      const hash = await service.hashBackupCode(code);
      
      const isValid = await service.verifyBackupCode('WRONG-CODE-HERE', hash);
      expect(isValid).toBe(false);
    });

    it('should produce different hashes for same code', async () => {
      const code = 'ABCD-EFGH-IJKL';
      const hash1 = await service.hashBackupCode(code);
      const hash2 = await service.hashBackupCode(code);
      
      expect(hash1).not.toBe(hash2);
      
      // But both should verify correctly
      expect(await service.verifyBackupCode(code, hash1)).toBe(true);
      expect(await service.verifyBackupCode(code, hash2)).toBe(true);
    });
  });
});
