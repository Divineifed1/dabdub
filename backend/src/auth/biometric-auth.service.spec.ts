import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { BiometricAuthService } from './biometric-auth.service';
import { BiometricToken } from './entities/biometric-token.entity';
import { TrustedDevice } from '../security/entities/trusted-device.entity';
import { User } from '../users/entities/user.entity';
import { AuthService } from './auth.service';

const biometricTokenRepo = {
  findOne: jest.fn(),
  find: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
};

const trustedDeviceRepo = {
  findOne: jest.fn(),
  find: jest.fn(),
};

const userRepo = {
  findOne: jest.fn(),
};

const authService = {
  issueTokens: jest.fn(),
};

const makeToken = (overrides: Partial<BiometricToken> = {}): BiometricToken =>
  ({
    id: 'bio-1',
    userId: 'user-1',
    deviceId: 'device-1',
    tokenHash: 'hash-1',
    lastUsedAt: null,
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    isRevoked: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }) as BiometricToken;

describe('BiometricAuthService', () => {
  let service: BiometricAuthService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BiometricAuthService,
        {
          provide: getRepositoryToken(BiometricToken),
          useValue: biometricTokenRepo,
        },
        {
          provide: getRepositoryToken(TrustedDevice),
          useValue: trustedDeviceRepo,
        },
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: AuthService, useValue: authService },
      ],
    }).compile();

    service = module.get(BiometricAuthService);
  });

  it('enroll returns token once for a trusted device', async () => {
    trustedDeviceRepo.findOne.mockResolvedValue({
      id: 'device-1',
      userId: 'user-1',
    });
    biometricTokenRepo.find.mockResolvedValue([]);
    biometricTokenRepo.create.mockImplementation((input) => input);
    biometricTokenRepo.save.mockResolvedValue(undefined);

    const result = await service.enroll('user-1', 'device-1');

    expect(result.biometricToken).toBeTruthy();
    expect(biometricTokenRepo.save).toHaveBeenCalled();
  });

  it('authenticate issues JWT tokens and rotates the biometric token', async () => {
    const validToken = makeToken({ tokenHash: 'rotating-hash' });
    biometricTokenRepo.findOne.mockResolvedValue(validToken);
    biometricTokenRepo.create.mockImplementation((input) => input);
    biometricTokenRepo.save.mockResolvedValue(validToken);
    userRepo.findOne.mockResolvedValue({
      id: 'user-1',
      username: 'alice',
      role: 'user',
      isActive: true,
    });
    authService.issueTokens.mockResolvedValue({
      accessToken: 'access',
      refreshToken: 'refresh',
      expiresIn: 900,
    });

    const response = await service.authenticate('raw-token', 'device-1');

    expect(response.accessToken).toBe('access');
    expect(response.biometricToken).toBeTruthy();
    expect(biometricTokenRepo.save).toHaveBeenCalled();
  });

  it('replayed token after rotation returns 401', async () => {
    biometricTokenRepo.findOne.mockResolvedValue(
      makeToken({ isRevoked: true, expiresAt: new Date(Date.now() + 1000) }),
    );

    await expect(service.authenticate('raw-token', 'device-1')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('expired token returns 401', async () => {
    biometricTokenRepo.findOne.mockResolvedValue(
      makeToken({ expiresAt: new Date(Date.now() - 1000) }),
    );

    await expect(service.authenticate('raw-token', 'device-1')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('revoked token returns 401', async () => {
    biometricTokenRepo.findOne.mockResolvedValue(makeToken({ isRevoked: true }));

    await expect(service.authenticate('raw-token', 'device-1')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('revokeAll clears tokens across devices', async () => {
    const tokens = [
      makeToken({ id: 'bio-1', deviceId: 'device-1' }),
      makeToken({ id: 'bio-2', deviceId: 'device-2' }),
    ];
    biometricTokenRepo.find.mockResolvedValue(tokens);
    biometricTokenRepo.save.mockResolvedValue(tokens);

    await service.revokeAll('user-1');

    expect(biometricTokenRepo.save).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ isRevoked: true, deviceId: 'device-1' }),
        expect.objectContaining({ isRevoked: true, deviceId: 'device-2' }),
      ]),
    );
  });

  it('throws when enrolling a non-trusted device', async () => {
    trustedDeviceRepo.findOne.mockResolvedValue(null);

    await expect(service.enroll('user-1', 'missing-device')).rejects.toThrow(
      NotFoundException,
    );
  });
});
