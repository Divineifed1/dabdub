import {
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  UnauthorizedException,
  Body,
  Param,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { ConfigType } from '@nestjs/config';
import type { Request } from 'express';
import { jwtConfig } from '../config/jwt.config';
import { Public } from './decorators/public.decorator';
import type { JwtPayload } from './auth.service';
import { BiometricAuthService } from './biometric-auth.service';
import {
  BiometricAuthenticateDto,
  BiometricAuthResponseDto,
} from './dto/biometric-authenticate.dto';
import {
  BiometricEnrollDto,
  BiometricEnrollResponseDto,
} from './dto/biometric-enroll.dto';
import { BiometricDeviceResponseDto } from './dto/biometric-device-response.dto';

type AuthenticatedRequest = Request & { user?: { id: string } };

@ApiTags('auth')
@ApiBearerAuth()
@Controller({ path: 'auth/biometric', version: '1' })
export class BiometricAuthController {
  constructor(
    private readonly biometricAuthService: BiometricAuthService,
    private readonly jwtService: JwtService,
    @Inject(jwtConfig.KEY)
    private readonly jwt: ConfigType<typeof jwtConfig>,
  ) {}

  @Post('enroll')
  @ApiOperation({ summary: 'Enroll biometric auth for a trusted device' })
  @ApiResponse({ status: 201, type: BiometricEnrollResponseDto })
  async enroll(
    @Req() req: AuthenticatedRequest,
    @Body() dto: BiometricEnrollDto,
    @Headers('authorization') authorization?: string,
  ): Promise<BiometricEnrollResponseDto> {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException('Unauthorized');
    }

    this.assertFreshPrimaryAuth(authorization);
    return this.biometricAuthService.enroll(userId, dto.deviceId);
  }

  @Public()
  @Post('authenticate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Authenticate with a rotating biometric token' })
  @ApiResponse({ status: 200, type: BiometricAuthResponseDto })
  authenticate(
    @Req() req: Request & { ip?: string; headers: Record<string, string | string[] | undefined> },
    @Body() dto: BiometricAuthenticateDto,
  ): Promise<BiometricAuthResponseDto> {
    const userAgent = req.headers['user-agent'];
    return this.biometricAuthService.authenticate(
      dto.biometricToken,
      dto.deviceId,
      req.ip ?? null,
      {
        deviceId: dto.deviceId,
        userAgent: Array.isArray(userAgent) ? userAgent[0] : userAgent,
      },
    );
  }

  @Delete(':deviceId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke biometric auth for a device' })
  async revoke(
    @Req() req: AuthenticatedRequest,
    @Param('deviceId') deviceId: string,
  ): Promise<void> {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException('Unauthorized');
    }

    await this.biometricAuthService.revoke(userId, deviceId);
  }

  @Get('devices')
  @ApiOperation({ summary: 'List devices with active biometric enrollment' })
  @ApiResponse({ status: 200, type: [BiometricDeviceResponseDto] })
  async listDevices(
    @Req() req: AuthenticatedRequest,
  ): Promise<BiometricDeviceResponseDto[]> {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException('Unauthorized');
    }

    return this.biometricAuthService.listDevices(userId);
  }

  private assertFreshPrimaryAuth(authorization?: string): void {
    const token = authorization?.replace(/^Bearer\s+/i, '');
    if (!token) {
      throw new UnauthorizedException('Missing bearer token');
    }

    const payload = this.jwtService.verify<JwtPayload & { iat?: number }>(token, {
      secret: this.jwt.accessSecret,
    });

    if (!['password', 'register', 'passkey'].includes(payload.authMethod)) {
      throw new UnauthorizedException('Fresh password or passkey login required');
    }

    if (!payload.iat || Date.now() - payload.iat * 1000 > 10 * 60 * 1000) {
      throw new UnauthorizedException('Fresh password or passkey login required');
    }
  }
}
