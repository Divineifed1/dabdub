import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { QrService } from './qr.service';
import { UserQrQueryDto } from './dto/user-qr-query.dto';
import { QrResponseDto } from './dto/qr-response.dto';

/**
 * Stub guard — replace with the project's real JWT/auth guard when available.
 * The @UseGuards decorator is left in place so the auth wiring is obvious.
 */
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';

@Injectable()
class StubAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    // Replace with real JwtAuthGuard from the auth module
    return true;
  }
}

@Controller('qr')
export class QrController {
  constructor(private readonly qrService: QrService) {}

  /**
   * GET /qr/user?amount=50&note=lunch
   * Authenticated. Uses req.user.username from the JWT payload.
   */
  @UseGuards(StubAuthGuard)
  @Get('user')
  async getUserQr(
    @Query() query: UserQrQueryDto,
    @Req() req: Request,
  ): Promise<QrResponseDto & { webFallbackUrl: string }> {
    const username: string =
      (req as any).user?.username ?? (req as any).user?.id ?? 'unknown';

    const result = await this.qrService.generateUserQr(
      username,
      query.amount,
      query.note,
    );

    return {
      ...result,
      webFallbackUrl: this.qrService.buildWebFallbackUrl(username),
    };
  }

  /**
   * GET /qr/paylinks/:tokenId
   * Public. Validates PayLink is active before generating.
   */
  @Get('paylinks/:tokenId')
  async getPayLinkQr(
    @Param('tokenId') tokenId: string,
  ): Promise<QrResponseDto> {
    return this.qrService.generatePayLinkQr(tokenId);
  }
}
