import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Request } from 'express';
import { Throttle } from '@nestjs/throttler';
import { AdminThrottlerGuard } from '../../common/guards/admin-throttler.guard';

import { LoginDto } from '../dto/login-v1.dto';
import { AdminAuthV1Service, AdminLoginResponse } from '../services/admin-auth-v1.service';

@ApiTags('Auth v1')
@Controller('api/v1/auth')
@UseGuards(AdminThrottlerGuard)
export class AuthV1Controller {
  constructor(private readonly adminAuthV1Service: AdminAuthV1Service) {}

  @Post('login')
  @Throttle({ auth: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Admin login (v1)',
    description:
      'Authenticate with email and password. Returns access token (15 min) and refresh token (7 days). ' +
      'If 2FA is enabled and totpCode is not provided, returns requiresTwoFactor and twoFactorToken.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Login successful or 2FA required',
    schema: {
      oneOf: [
        {
          type: 'object',
          properties: {
            accessToken: { type: 'string' },
            refreshToken: { type: 'string' },
            expiresIn: { type: 'number', example: 900 },
            tokenType: { type: 'string', example: 'Bearer' },
            requiresTwoFactor: { type: 'boolean', example: false },
            admin: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                email: { type: 'string' },
                firstName: { type: 'string' },
                lastName: { type: 'string' },
                role: { type: 'string' },
                permissions: { type: 'array', items: { type: 'string' } },
                twoFactorEnabled: { type: 'boolean' },
                lastLoginAt: { type: 'string', nullable: true },
              },
            },
          },
        },
        {
          type: 'object',
          properties: {
            requiresTwoFactor: { type: 'boolean', example: true },
            twoFactorToken: { type: 'string' },
          },
        },
      ],
    },
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Invalid email or password (generic message)',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Account suspended',
  })
  @ApiResponse({
    status: HttpStatus.LOCKED,
    description: 'Account locked; Retry-After header indicates seconds until retry',
  })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
  ): Promise<AdminLoginResponse> {
    const ip = req.ip ?? req.socket?.remoteAddress;
    const userAgent = req.get('user-agent');
    return this.adminAuthV1Service.login(dto, ip, userAgent);
  }
}
