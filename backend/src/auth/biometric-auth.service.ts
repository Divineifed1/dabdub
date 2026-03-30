import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'crypto';
import { In, Repository } from 'typeorm';
import { TrustedDevice } from '../security/entities/trusted-device.entity';
import { User } from '../users/entities/user.entity';
import { AuthService } from './auth.service';
import { BiometricToken } from './entities/biometric-token.entity';
import { BiometricAuthResponseDto } from './dto/biometric-authenticate.dto';
import { BiometricDeviceResponseDto } from './dto/biometric-device-response.dto';

const BIOMETRIC_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

@Injectable()
export class BiometricAuthService {
  constructor(
    @InjectRepository(BiometricToken)
    private readonly biometricTokenRepo: Repository<BiometricToken>,

    @InjectRepository(TrustedDevice)
    private readonly trustedDeviceRepo: Repository<TrustedDevice>,

    @InjectRepository(User)
    private readonly userRepo: Repository<User>,

    private readonly authService: AuthService,
  ) {}

  async enroll(
    userId: string,
    deviceId: string,
  ): Promise<{ biometricToken: string }> {
    await this.assertTrustedDevice(userId, deviceId);
    await this.revoke(userId, deviceId);

    const biometricToken = await this.createToken(userId, deviceId);
    return { biometricToken };
  }

  async authenticate(
    rawToken: string,
    deviceId: string,
    ipAddress?: string | null,
    deviceInfo?: Record<string, unknown>,
  ): Promise<BiometricAuthResponseDto> {
    const tokenHash = this.hashToken(rawToken);
    const token = await this.biometricTokenRepo.findOne({
      where: { tokenHash, deviceId },
    });

    if (!token || token.isRevoked) {
      throw new UnauthorizedException('Biometric token is invalid');
    }

    if (token.expiresAt <= new Date()) {
      throw new UnauthorizedException('Biometric token has expired');
    }

    const user = await this.userRepo.findOne({ where: { id: token.userId } });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('User not found');
    }

    token.isRevoked = true;
    token.lastUsedAt = new Date();
    await this.biometricTokenRepo.save(token);

    const rotatedToken = await this.createToken(token.userId, deviceId);
    const jwtPair = await this.authService.issueTokens(
      user,
      undefined,
      ipAddress,
      { ...(deviceInfo ?? {}), deviceId },
      'biometric',
    );

    return {
      ...jwtPair,
      biometricToken: rotatedToken,
    };
  }

  async revoke(userId: string, deviceId: string): Promise<void> {
    const active = await this.biometricTokenRepo.find({
      where: { userId, deviceId, isRevoked: false },
    });

    if (active.length === 0) {
      return;
    }

    const revokedAt = new Date();
    for (const token of active) {
      token.isRevoked = true;
      token.lastUsedAt = token.lastUsedAt ?? revokedAt;
    }
    await this.biometricTokenRepo.save(active);
  }

  async revokeAll(userId: string): Promise<void> {
    const active = await this.biometricTokenRepo.find({
      where: { userId, isRevoked: false },
    });

    if (active.length === 0) {
      return;
    }

    const revokedAt = new Date();
    for (const token of active) {
      token.isRevoked = true;
      token.lastUsedAt = token.lastUsedAt ?? revokedAt;
    }
    await this.biometricTokenRepo.save(active);
  }

  async listDevices(userId: string): Promise<BiometricDeviceResponseDto[]> {
    const tokens = await this.biometricTokenRepo.find({
      where: { userId, isRevoked: false },
      order: { createdAt: 'DESC' },
    });

    if (tokens.length === 0) {
      return [];
    }

    const deviceIds = [...new Set(tokens.map((token) => token.deviceId))];
    const devices = await this.trustedDeviceRepo.find({
      where: { userId, id: In(deviceIds) },
    });
    const deviceById = new Map(devices.map((device) => [device.id, device]));
    const latestTokenByDevice = new Map<string, BiometricToken>();

    for (const token of tokens) {
      if (!latestTokenByDevice.has(token.deviceId)) {
        latestTokenByDevice.set(token.deviceId, token);
      }
    }

    return [...latestTokenByDevice.entries()].map(([deviceId, token]) => {
      const device = deviceById.get(deviceId);
      return {
        deviceId,
        deviceName: device?.deviceName ?? 'Unknown device',
        lastUsedAt: token.lastUsedAt?.toISOString() ?? null,
        expiresAt: token.expiresAt.toISOString(),
      };
    });
  }

  private async createToken(userId: string, deviceId: string): Promise<string> {
    const rawToken = randomBytes(48).toString('hex');
    const entity = this.biometricTokenRepo.create({
      userId,
      deviceId,
      tokenHash: this.hashToken(rawToken),
      lastUsedAt: null,
      expiresAt: new Date(Date.now() + BIOMETRIC_TOKEN_TTL_MS),
      isRevoked: false,
    });

    await this.biometricTokenRepo.save(entity);
    return rawToken;
  }

  private async assertTrustedDevice(
    userId: string,
    deviceId: string,
  ): Promise<TrustedDevice> {
    const device = await this.trustedDeviceRepo.findOne({
      where: { id: deviceId, userId },
    });

    if (!device) {
      throw new NotFoundException('Trusted device not found');
    }

    return device;
  }

  private hashToken(rawToken: string): string {
    return createHash('sha256').update(rawToken).digest('hex');
  }
}
