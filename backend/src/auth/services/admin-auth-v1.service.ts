import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { authenticator } from 'otplib';
import { v4 as uuidv4 } from 'uuid';
import * as crypto from 'crypto';

import { AdminUser, AdminRole, AdminStatus, ADMIN_ROLE_PERMISSIONS } from '../../database/entities/admin-user.entity';
import { PasswordService } from './password.service';
import { CacheService } from '../../cache/cache.service';
import { CryptoService } from '../../common/crypto/crypto.service';
import { AuditLogService } from '../../audit/audit-log.service';
import { AuditAction, ActorType, DataClassification } from '../../database/entities/audit-log.enums';
import { LoginDto } from '../dto/login-v1.dto';

const ACCESS_TOKEN_EXPIRES_SEC = 900; // 15 minutes
const REFRESH_TOKEN_EXPIRES_DAYS = 7;
const REFRESH_TOKEN_EXPIRES_SEC = REFRESH_TOKEN_EXPIRES_DAYS * 24 * 60 * 60;
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 30 * 60 * 1000; // 30 minutes
const TWO_FACTOR_TOKEN_EXPIRES_SEC = 300; // 5 minutes

export interface AdminLoginSuccessResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: 'Bearer';
  requiresTwoFactor: false;
  admin: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: AdminRole;
    permissions: string[];
    twoFactorEnabled: boolean;
    lastLoginAt: string | null;
  };
}

export interface AdminLoginTwoFactorRequiredResponse {
  requiresTwoFactor: true;
  twoFactorToken: string;
}

export type AdminLoginResponse = AdminLoginSuccessResponse | AdminLoginTwoFactorRequiredResponse;

@Injectable()
export class AdminAuthV1Service {
  private readonly logger = new Logger(AdminAuthV1Service.name);

  constructor(
    @InjectRepository(AdminUser)
    private readonly adminUserRepository: Repository<AdminUser>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly passwordService: PasswordService,
    private readonly cacheService: CacheService,
    private readonly cryptoService: CryptoService,
    private readonly auditLogService: AuditLogService,
  ) {
    authenticator.options = { window: 1 };
  }

  async login(
    dto: LoginDto,
    ipAddress: string | undefined,
    userAgent: string | undefined,
  ): Promise<AdminLoginResponse> {
    const ip = ipAddress ?? 'unknown';
    const ua = userAgent ?? '';

    const admin = await this.findAdminByEmail(dto.email);
    if (!admin) {
      await this.auditLogService.log({
        entityType: 'AdminUser',
        entityId: 'unknown',
        action: AuditAction.ADMIN_LOGIN,
        actorId: 'unknown',
        actorType: ActorType.SYSTEM,
        ipAddress: ip,
        userAgent: ua,
        afterState: { success: false, reason: 'invalid_credentials' },
        dataClassification: DataClassification.SENSITIVE,
      });
      throw new UnauthorizedException('Invalid email or password');
    }

    if (admin.status === AdminStatus.SUSPENDED) {
      await this.auditLogService.log({
        entityType: 'AdminUser',
        entityId: admin.id,
        action: AuditAction.ADMIN_LOGIN,
        actorId: admin.id,
        actorType: ActorType.ADMIN,
        ipAddress: ip,
        userAgent: ua,
        afterState: { success: false, reason: 'account_suspended' },
        dataClassification: DataClassification.SENSITIVE,
      });
      throw new ForbiddenException('Account suspended');
    }

    if (admin.status === AdminStatus.LOCKED && admin.lockedUntil) {
      const now = new Date();
      if (admin.lockedUntil > now) {
        const retryAfterSec = Math.ceil((admin.lockedUntil.getTime() - now.getTime()) / 1000);
        await this.auditLogService.log({
          entityType: 'AdminUser',
          entityId: admin.id,
          action: AuditAction.ADMIN_LOGIN,
          actorId: admin.id,
          actorType: ActorType.ADMIN,
          ipAddress: ip,
          userAgent: ua,
          afterState: { success: false, reason: 'account_locked' },
          dataClassification: DataClassification.SENSITIVE,
        });
        throw new HttpException(
          { statusCode: HttpStatus.LOCKED, message: 'Account temporarily locked' },
          HttpStatus.LOCKED,
          { headers: { 'Retry-After': String(retryAfterSec) } },
        );
      }
      // Lock expired – clear lock so they can try again
      admin.status = AdminStatus.ACTIVE;
      admin.lockedUntil = null;
      admin.failedLoginAttempts = 0;
      await this.adminUserRepository.save(admin);
    }

    const passwordValid = await this.passwordService.comparePassword(
      dto.password,
      admin.passwordHash,
    );
    if (!passwordValid) {
      admin.failedLoginAttempts = (admin.failedLoginAttempts ?? 0) + 1;
      if (admin.failedLoginAttempts >= MAX_FAILED_ATTEMPTS) {
        admin.status = AdminStatus.LOCKED;
        admin.lockedUntil = new Date(Date.now() + LOCKOUT_DURATION_MS);
      }
      await this.adminUserRepository.save(admin);
      await this.auditLogService.log({
        entityType: 'AdminUser',
        entityId: admin.id,
        action: AuditAction.ADMIN_LOGIN,
        actorId: admin.id,
        actorType: ActorType.ADMIN,
        ipAddress: ip,
        userAgent: ua,
        afterState: { success: false, reason: 'invalid_password', failedAttempts: admin.failedLoginAttempts },
        dataClassification: DataClassification.SENSITIVE,
      });
      throw new UnauthorizedException('Invalid email or password');
    }

    if (admin.twoFactorEnabled) {
      if (!dto.totpCode) {
        const twoFactorToken = this.jwtService.sign(
          {
            sub: admin.id,
            type: 'admin_2fa_step',
            iat: Math.floor(Date.now() / 1000),
            exp: Math.floor(Date.now() / 1000) + TWO_FACTOR_TOKEN_EXPIRES_SEC,
          },
          { expiresIn: TWO_FACTOR_TOKEN_EXPIRES_SEC },
        );
        return {
          requiresTwoFactor: true,
          twoFactorToken,
        };
      }
      const secret = admin.twoFactorSecret
        ? this.cryptoService.decrypt(admin.twoFactorSecret)
        : '';
      const totpValid = secret && authenticator.verify({ token: dto.totpCode, secret });
      if (!totpValid) {
        await this.auditLogService.log({
          entityType: 'AdminUser',
          entityId: admin.id,
          action: AuditAction.ADMIN_LOGIN,
          actorId: admin.id,
          actorType: ActorType.ADMIN,
          ipAddress: ip,
          userAgent: ua,
          afterState: { success: false, reason: 'invalid_totp' },
          dataClassification: DataClassification.SENSITIVE,
        });
        throw new UnauthorizedException('Invalid email or password');
      }
    }

    admin.failedLoginAttempts = 0;
    admin.lockedUntil = null;
    admin.lastLoginAt = new Date();
    admin.lastLoginIp = ip;
    await this.adminUserRepository.save(admin);

    const sessionId = uuidv4();
    const permissions = ADMIN_ROLE_PERMISSIONS[admin.role] ?? [];

    const accessToken = this.jwtService.sign(
      {
        sub: admin.id,
        email: admin.email,
        role: admin.role,
        permissions,
        sessionId,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + ACCESS_TOKEN_EXPIRES_SEC,
      },
      { expiresIn: ACCESS_TOKEN_EXPIRES_SEC },
    );

    const refreshToken = this.jwtService.sign(
      {
        sub: admin.id,
        sessionId,
        type: 'admin_refresh_v1',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + REFRESH_TOKEN_EXPIRES_SEC,
      },
      { expiresIn: REFRESH_TOKEN_EXPIRES_SEC },
    );

    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    await this.cacheService.set(
      `auth:refresh:admin_v1:${admin.id}:${sessionId}`,
      tokenHash,
      { ttl: REFRESH_TOKEN_EXPIRES_SEC },
    );

    const sessionData = {
      sessionId,
      ip,
      userAgent: ua,
      createdAt: new Date().toISOString(),
      lastUsedAt: new Date().toISOString(),
    };
    await this.cacheService.hset(
      `auth:sessions:admin_v1:${admin.id}`,
      sessionId,
      JSON.stringify(sessionData),
    );

    await this.auditLogService.log({
      entityType: 'AdminUser',
      entityId: admin.id,
      action: AuditAction.ADMIN_LOGIN,
      actorId: admin.id,
      actorType: ActorType.ADMIN,
      ipAddress: ip,
      userAgent: ua,
      afterState: { success: true, sessionId },
      dataClassification: DataClassification.SENSITIVE,
    });

    this.logger.log(`Admin login successful for ${admin.email} from ${ip}`);

    return {
      accessToken,
      refreshToken,
      expiresIn: ACCESS_TOKEN_EXPIRES_SEC,
      tokenType: 'Bearer',
      requiresTwoFactor: false,
      admin: {
        id: admin.id,
        email: admin.email,
        firstName: admin.firstName,
        lastName: admin.lastName,
        role: admin.role,
        permissions,
        twoFactorEnabled: admin.twoFactorEnabled,
        lastLoginAt: admin.lastLoginAt?.toISOString() ?? null,
      },
    };
  }

  private async findAdminByEmail(email: string): Promise<AdminUser | null> {
    const admin = await this.adminUserRepository
      .createQueryBuilder('admin')
      .where('LOWER(admin.email) = LOWER(:email)', { email })
      .addSelect('admin.passwordHash')
      .addSelect('admin.twoFactorSecret')
      .getOne();
    return admin ?? null;
  }
}
