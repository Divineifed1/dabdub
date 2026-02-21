import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import {
  ConflictException,
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { AdminTwoFactorService } from './admin-two-factor.service';
import { UserEntity, UserRole } from '../../database/entities/user.entity';
import { CryptoService } from '../../common/crypto/crypto.service';
import { CacheService } from '../../cache/cache.service';
import { PasswordService } from './password.service';
import { authenticator } from 'otplib';

describe('AdminTwoFactorService', () => {
  let service: AdminTwoFactorService;
  let userRepository: Repository<UserEntity>;
  let cryptoService: CryptoService;
  let cacheService: CacheService;
  let passwordService: PasswordService;
  let jwtService: JwtService;

  const mockUser: Partial<UserEntity> = {
    id: 'admin-123',
    email: 'admin@cheese.io',
    role: UserRole.ADMIN,
    twoFactorEnabled: false,
    twoFactorSecret: null,
    backupCodeHashes: null,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminTwoFactorService,
        {
          provide: getRepositoryToken(UserEntity),
          useValue: {
            findOne: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: CryptoService,
          useValue: {
            encrypt: jest.fn((text) => `encrypted:${text}`),
            decrypt: jest.fn((text) => text.replace('encrypted:', '')),
            generateBackupCodes: jest.fn(() => [
              'AAAA-BBBB-CCCC',
              'DDDD-EEEE-FFFF',
            ]),
            hashBackupCode: jest.fn((code) => `hashed:${code}`),
            verifyBackupCode: jest.fn((code, hash) => hash === `hashed:${code}`),
          },
        },
        {
          provide: CacheService,
          useValue: {
            get: jest.fn(),
            set: jest.fn(),
            del: jest.fn(),
            hget: jest.fn(),
            hset: jest.fn(),
            hdel: jest.fn(),
            hgetall: jest.fn(),
            delPattern: jest.fn(),
          },
        },
        {
          provide: PasswordService,
          useValue: {
            comparePassword: jest.fn(),
          },
        },
        {
          provide: JwtService,
          useValue: {
            sign: jest.fn((payload) => `jwt.token.${payload.type}`),
            verify: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key) => {
              if (key === 'ADMIN_JWT_EXPIRES_IN') return '2h';
              return null;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<AdminTwoFactorService>(AdminTwoFactorService);
    userRepository = module.get<Repository<UserEntity>>(
      getRepositoryToken(UserEntity),
    );
    cryptoService = module.get<CryptoService>(CryptoService);
    cacheService = module.get<CacheService>(CacheService);
    passwordService = module.get<PasswordService>(PasswordService);
    jwtService = module.get<JwtService>(JwtService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('setup', () => {
    it('should initiate 2FA setup successfully', async () => {
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(mockUser as UserEntity);
      jest.spyOn(cacheService, 'set').mockResolvedValue(undefined);

      const result = await service.setup('admin-123');

      expect(result).toHaveProperty('secret');
      expect(result).toHaveProperty('qrCode');
      expect(result).toHaveProperty('qrUri');
      expect(result.expiresInSeconds).toBe(600);
      expect(result.qrUri).toContain('otpauth://totp/');
      expect(result.qrUri).toContain('admin@cheese.io');
      expect(result.qrCode).toContain('data:image/png;base64');
    });

    it('should throw ConflictException if 2FA already enabled', async () => {
      const userWith2FA = { ...mockUser, twoFactorEnabled: true };
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(userWith2FA as UserEntity);

      await expect(service.setup('admin-123')).rejects.toThrow(ConflictException);
    });

    it('should throw BadRequestException if user not found', async () => {
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(null);

      await expect(service.setup('admin-123')).rejects.toThrow(BadRequestException);
    });
  });

  describe('verifySetup', () => {
    it('should enable 2FA with valid code', async () => {
      const secret = authenticator.generateSecret();
      const validCode = authenticator.generate(secret);
      
      jest.spyOn(cacheService, 'get').mockResolvedValue(`encrypted:${secret}`);
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(mockUser as UserEntity);
      jest.spyOn(userRepository, 'save').mockResolvedValue(mockUser as UserEntity);
      jest.spyOn(cacheService, 'del').mockResolvedValue(1);
      jest.spyOn(cacheService, 'delPattern').mockResolvedValue(undefined);
      jest.spyOn(cacheService, 'hgetall').mockResolvedValue(null);

      const result = await service.verifySetup('admin-123', validCode);

      expect(result.enabled).toBe(true);
      expect(result.backupCodes).toHaveLength(2);
      expect(userRepository.save).toHaveBeenCalled();
    });

    it('should throw BadRequestException if setup expired', async () => {
      jest.spyOn(cacheService, 'get').mockResolvedValue(null);

      await expect(service.verifySetup('admin-123', '123456')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException with invalid code', async () => {
      const secret = authenticator.generateSecret();
      
      jest.spyOn(cacheService, 'get').mockResolvedValue(`encrypted:${secret}`);

      await expect(service.verifySetup('admin-123', '000000')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('disable', () => {
    it('should disable 2FA for ADMIN role', async () => {
      const secret = authenticator.generateSecret();
      const validCode = authenticator.generate(secret);
      const userWith2FA = {
        ...mockUser,
        twoFactorEnabled: true,
        twoFactorSecret: `encrypted:${secret}`,
      };

      jest.spyOn(userRepository, 'findOne').mockResolvedValue(userWith2FA as UserEntity);
      jest.spyOn(passwordService, 'comparePassword').mockResolvedValue(true);
      jest.spyOn(userRepository, 'save').mockResolvedValue(mockUser as UserEntity);
      jest.spyOn(cacheService, 'delPattern').mockResolvedValue(undefined);
      jest.spyOn(cacheService, 'hgetall').mockResolvedValue(null);

      await service.disable('admin-123', validCode, 'password123');

      expect(userRepository.save).toHaveBeenCalled();
    });

    it('should throw ForbiddenException for SUPER_ADMIN', async () => {
      const superAdmin = { ...mockUser, role: UserRole.SUPER_ADMIN };
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(superAdmin as UserEntity);

      await expect(
        service.disable('admin-123', '123456', 'password123'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw UnauthorizedException with invalid password', async () => {
      const userWith2FA = {
        ...mockUser,
        twoFactorEnabled: true,
        twoFactorSecret: 'encrypted:secret',
      };

      jest.spyOn(userRepository, 'findOne').mockResolvedValue(userWith2FA as UserEntity);
      jest.spyOn(passwordService, 'comparePassword').mockResolvedValue(false);

      await expect(
        service.disable('admin-123', '123456', 'wrongpassword'),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('validate', () => {
    it('should validate TOTP code successfully', async () => {
      const secret = authenticator.generateSecret();
      const validCode = authenticator.generate(secret);
      const userWith2FA = {
        ...mockUser,
        twoFactorEnabled: true,
        twoFactorSecret: `encrypted:${secret}`,
      };

      jest.spyOn(jwtService, 'verify').mockReturnValue({
        sub: 'admin-123',
        type: '2fa_pending',
        sessionId: 'session-123',
      });
      jest.spyOn(cacheService, 'get').mockResolvedValue(null);
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(userWith2FA as UserEntity);
      jest.spyOn(cacheService, 'del').mockResolvedValue(1);
      jest.spyOn(cacheService, 'hset').mockResolvedValue(1);
      jest.spyOn(cacheService, 'set').mockResolvedValue(undefined);

      const result = await service.validate('2fa.token', validCode);

      expect(result).toHaveProperty('access_token');
      expect(result).toHaveProperty('refresh_token');
      expect(result.admin.id).toBe('admin-123');
    });

    it('should validate backup code and remove it', async () => {
      const userWith2FA = {
        ...mockUser,
        twoFactorEnabled: true,
        twoFactorSecret: 'encrypted:secret',
        backupCodeHashes: ['hashed:AAAA-BBBB-CCCC', 'hashed:DDDD-EEEE-FFFF'],
      };

      jest.spyOn(jwtService, 'verify').mockReturnValue({
        sub: 'admin-123',
        type: '2fa_pending',
        sessionId: 'session-123',
      });
      jest.spyOn(cacheService, 'get').mockResolvedValue(null);
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(userWith2FA as UserEntity);
      jest.spyOn(userRepository, 'save').mockResolvedValue(userWith2FA as UserEntity);
      jest.spyOn(cacheService, 'del').mockResolvedValue(1);
      jest.spyOn(cacheService, 'hset').mockResolvedValue(1);
      jest.spyOn(cacheService, 'set').mockResolvedValue(undefined);

      const result = await service.validate('2fa.token', undefined, 'AAAA-BBBB-CCCC');

      expect(result).toHaveProperty('access_token');
      expect(userRepository.save).toHaveBeenCalled();
    });

    it('should reject used backup code', async () => {
      const userWith2FA = {
        ...mockUser,
        twoFactorEnabled: true,
        twoFactorSecret: 'encrypted:secret',
        backupCodeHashes: ['hashed:DDDD-EEEE-FFFF'],
      };

      jest.spyOn(jwtService, 'verify').mockReturnValue({
        sub: 'admin-123',
        type: '2fa_pending',
        sessionId: 'session-123',
      });
      jest.spyOn(cacheService, 'get').mockResolvedValue(null);
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(userWith2FA as UserEntity);

      await expect(
        service.validate('2fa.token', undefined, 'AAAA-BBBB-CCCC'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw ForbiddenException after 5 failed attempts', async () => {
      jest.spyOn(jwtService, 'verify').mockReturnValue({
        sub: 'admin-123',
        type: '2fa_pending',
        sessionId: 'session-123',
      });
      jest.spyOn(cacheService, 'get').mockResolvedValue(true); // Locked out

      await expect(service.validate('2fa.token', '123456')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('regenerateBackupCodes', () => {
    it('should regenerate backup codes with valid TOTP', async () => {
      const secret = authenticator.generateSecret();
      const validCode = authenticator.generate(secret);
      const userWith2FA = {
        ...mockUser,
        twoFactorEnabled: true,
        twoFactorSecret: `encrypted:${secret}`,
        backupCodeHashes: ['old-hash-1', 'old-hash-2'],
      };

      jest.spyOn(userRepository, 'findOne').mockResolvedValue(userWith2FA as UserEntity);
      jest.spyOn(userRepository, 'save').mockResolvedValue(userWith2FA as UserEntity);

      const result = await service.regenerateBackupCodes('admin-123', validCode);

      expect(result.backupCodes).toHaveLength(2);
      expect(userRepository.save).toHaveBeenCalled();
    });

    it('should throw BadRequestException if 2FA not enabled', async () => {
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(mockUser as UserEntity);

      await expect(
        service.regenerateBackupCodes('admin-123', '123456'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException with invalid TOTP', async () => {
      const userWith2FA = {
        ...mockUser,
        twoFactorEnabled: true,
        twoFactorSecret: 'encrypted:secret',
      };

      jest.spyOn(userRepository, 'findOne').mockResolvedValue(userWith2FA as UserEntity);

      await expect(
        service.regenerateBackupCodes('admin-123', '000000'),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
