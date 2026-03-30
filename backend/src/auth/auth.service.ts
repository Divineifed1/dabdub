import {
  ConflictException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import type { ConfigType } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { createHash, randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { CacheService } from '../cache/cache.service';
import { GeoService } from '../geo/geo.service';
import { Role } from '../rbac/rbac.types';
import { jwtConfig } from '../config/jwt.config';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { TokenResponseDto } from './dto/token-response.dto';
import { RefreshToken } from './entities/refresh-token.entity';
import { Session } from './entities/session.entity';

export type AuthMethod =
  | 'password'
  | 'register'
  | 'refresh'
  | 'passkey'
  | 'biometric';

export interface JwtPayload {
  sub: string;
  username: string;
  role: Role;
  sessionId: string;
  authMethod: AuthMethod;
  isAdmin?: boolean;
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,

    @InjectRepository(RefreshToken)
    private readonly tokenRepo: Repository<RefreshToken>,

    @InjectRepository(Session)
    private readonly sessionRepo: Repository<Session>,

    private readonly jwtService: JwtService,

    @Inject(jwtConfig.KEY)
    private readonly jwt: ConfigType<typeof jwtConfig>,

    private readonly cacheService: CacheService,
    private readonly geoService: GeoService,
  ) {}

  async register(
    dto: RegisterDto,
    ipAddress?: string | null,
    deviceInfo?: Record<string, unknown>,
  ): Promise<TokenResponseDto> {
    const email = dto.email.trim().toLowerCase();
    const username = dto.username.trim();

    const existingByEmail = await this.userRepo.findOne({ where: { email } });
    if (existingByEmail) {
      throw new ConflictException('Email already exists');
    }

    const existingByUsername = await this.userRepo.findOne({
      where: { username },
    });
    if (existingByUsername) {
      throw new ConflictException('Username already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = this.userRepo.create({
      email,
      username,
      passwordHash,
      role: Role.User,
      isActive: true,
      isAdmin: false,
      isMerchant: false,
      isTreasury: false,
    });

    const saved = await this.userRepo.save(user);
    return this.issueTokens(
      saved,
      undefined,
      ipAddress,
      deviceInfo,
      'register',
    );
  }

  async login(
    dto: LoginDto,
    ipAddress?: string | null,
    deviceInfo?: Record<string, unknown>,
  ): Promise<TokenResponseDto> {
    const email = dto.email.trim().toLowerCase();
    const user = await this.userRepo.findOne({ where: { email } });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const matches = await bcrypt.compare(dto.password, user.passwordHash);
    if (!matches) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.issueTokens(user, undefined, ipAddress, deviceInfo, 'password');
  }

  async refresh(rawRefreshToken: string): Promise<TokenResponseDto> {
    let payload: JwtPayload;
    try {
      payload = this.jwtService.verify<JwtPayload>(rawRefreshToken, {
        secret: this.jwt.refreshSecret,
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const tokenHash = this.hashToken(rawRefreshToken);
    const stored = await this.tokenRepo.findOne({
      where: { sessionId: payload.sessionId, tokenHash },
    });

    if (!stored || stored.revokedAt || stored.expiresAt <= new Date()) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    stored.revokedAt = new Date();
    await this.tokenRepo.save(stored);

    const user = await this.userRepo.findOne({ where: { id: payload.sub } });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('User not found');
    }

    return this.issueTokens(
      user,
      payload.sessionId,
      stored.ipAddress,
      stored.deviceInfo ?? undefined,
      'refresh',
    );
  }

  async logout(sessionId: string): Promise<void> {
    const token = await this.tokenRepo.findOne({ where: { sessionId } });
    if (!token || token.revokedAt) {
      return;
    }

    token.revokedAt = new Date();
    await this.tokenRepo.save(token);
  }

  async issueTokens(
    user: Pick<User, 'id' | 'username' | 'role'>,
    sessionId: string = randomUUID(),
    ipAddress?: string | null,
    deviceInfo?: Record<string, unknown>,
    authMethod: AuthMethod = 'password',
  ): Promise<TokenResponseDto> {
    const payload: JwtPayload = {
      sub: user.id,
      username: user.username,
      role: user.role,
      sessionId,
      authMethod,
    };

    const accessToken = this.jwtService.sign(payload, {
      secret: this.jwt.accessSecret,
      expiresIn: this.jwt.accessExpiry,
    });

    const refreshToken = this.jwtService.sign(payload, {
      secret: this.jwt.refreshSecret,
      expiresIn: this.jwt.refreshExpiry,
    });

    const storedToken = await this.tokenRepo.save(
      this.tokenRepo.create({
        userId: user.id,
        tokenHash: this.hashToken(refreshToken),
        sessionId,
        deviceInfo: deviceInfo ?? null,
        ipAddress: ipAddress ?? null,
        expiresAt: new Date(
          Date.now() + this.parseDurationToSeconds(this.jwt.refreshExpiry) * 1000,
        ),
        revokedAt: null,
      }),
    );

    const session = this.sessionRepo.create({
      id: sessionId,
      userId: user.id,
      refreshTokenId: storedToken.id,
      deviceInfo: deviceInfo ?? null,
      ipAddress: ipAddress ?? null,
      country: this.geoService.getCountry(ipAddress ?? null),
      lastSeenAt: new Date(),
    });
    await this.sessionRepo.save(session);

    await this.cacheService.trackActiveUser(user.id).catch(() => undefined);

    return {
      accessToken,
      refreshToken,
      expiresIn: this.parseDurationToSeconds(this.jwt.accessExpiry),
    };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private parseDurationToSeconds(value: string): number {
    if (/^\d+$/.test(value)) {
      return parseInt(value, 10);
    }

    const match = value.trim().match(/^(\d+)([smhd])$/i);
    if (!match) {
      throw new Error(`Unsupported duration: ${value}`);
    }

    const amount = parseInt(match[1], 10);
    const unit = match[2].toLowerCase();
    const multiplier =
      unit === 's'
        ? 1
        : unit === 'm'
          ? 60
          : unit === 'h'
            ? 60 * 60
            : 60 * 60 * 24;

    return amount * multiplier;
  }
}
