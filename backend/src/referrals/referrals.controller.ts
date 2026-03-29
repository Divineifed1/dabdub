import { Controller, Get, Request, Query, UseGuards, Version, BadRequestException } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtGuard } from '../auth/guards/jwt.guard';
import {
  ReferralCodeResponseDto,
  ReferralStatsDto,
} from './dto/referral-stats.dto';
import { ReferralService } from './referral.service';

@ApiTags('Referrals')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtGuard)
@Controller({ path: 'referrals', version: '1' })
export class ReferralsController {
  constructor(
    private readonly referralService: ReferralService,
    private readonly analyticsService: ReferralAnalyticsService,
  ) {}

  @Version('1')
  @Get('code')
  @ApiOperation({ summary: 'Get or generate the current user referral code' })
  @ApiResponse({
    status: 200,
    type: ReferralCodeResponseDto,
  })
  async getCode(@Request() req: any): Promise<ReferralCodeResponseDto> {
    return {
      code: await this.referralService.generateCode(req.user.id),
    };
  }

  @Version('1')
  @Get('stats')
  @ApiOperation({ summary: 'Get referral stats for the current user' })
  @ApiResponse({
    status: 200,
    type: ReferralStatsDto,
  })
  getStats(@Request() req: any): Promise<ReferralStatsDto> {
    return this.referralService.getStats(req.user.id);
  }

  @Version('1')
  @Get('track')
  @ApiOperation({ summary: 'Track invite click (public)' })
  async trackClick(@Query('ref') refCode: string) {
    if (!refCode) {
      throw new BadRequestException('ref code required');
    }
    await this.referralService.assertReferralCodeExists(refCode); // validate
    await this.analyticsService.incrementClick(refCode);
    const registerUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/register?ref=${refCode}`;
    // Redirect
    // Since NestJS API, return redirect URL for frontend or use res.redirect if extend
    return { redirectTo: registerUrl };
  }
}
