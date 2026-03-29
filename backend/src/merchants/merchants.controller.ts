import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Request } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { User } from '../users/entities/user.entity';
import { MerchantPublicProfileDto } from './dto/merchant-public-profile.dto';
import { PosQrQueryDto } from './dto/pos-qr-query.dto';
import { PosQrResponseDto } from './dto/pos-qr-response.dto';
import { RegisterMerchantDto } from './dto/register-merchant.dto';
import { UpdateMerchantDto } from './dto/update-merchant.dto';
import { Merchant } from './entities/merchant.entity';
import { MerchantsService } from './merchants.service';
import { MerchantPosService } from './merchant-pos.service';

type AuthenticatedRequest = Request & { user: User };

@ApiTags('merchants')
@ApiBearerAuth()
@Controller({ path: 'merchants', version: '1' })
export class MerchantsController {
  constructor(
    private readonly merchantsService: MerchantsService,
    private readonly merchantPosService: MerchantPosService,
  ) {}


  @Post('register')
  @ApiOperation({
    summary: 'Create a merchant profile for the authenticated user',
  })
  @ApiResponse({ status: 201, type: Merchant })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 409, description: 'Merchant profile already exists' })
  register(
    @Req() req: AuthenticatedRequest,
    @Body() dto: RegisterMerchantDto,
  ): Promise<Merchant> {
    return this.merchantsService.register(req.user, dto);
  }

@Get('me')
  @ApiOperation({
    summary: 'Get current merchant profile (merchant accounts only)',
  })
  @ApiResponse({ status: 200, type: Merchant })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Merchant account required' })
  getMe(@Req() req: AuthenticatedRequest): Promise<Merchant> {
    return this.merchantsService.getMe(req.user);
  }

  @Get('me/pos-qr')
  @ApiOperation({ 
    summary: 'Get merchant POS QR code. Persistent if no amount/note, one-time otherwise.',
    description: 'Persistent QR caches 24h in Redis pos:qr:{merchantId}. One-time for specific amount/note.'
  })
  @ApiQuery({ name: 'amount', type: Number, required: false })
  @ApiQuery({ name: 'note', required: false })
  @ApiResponse({ status: 200, type: PosQrResponseDto })
  @ApiResponse({ status: 403, description: 'Merchant account required' })
  async getPosQr(
    @Req() req: AuthenticatedRequest,
    @Query() query: PosQrQueryDto,
  ): Promise<PosQrResponseDto> {
    const merchant = await this.merchantsService.getMe(req.user);
    if (query.amount) {
      return this.merchantPosService.getPosQrWithAmount(merchant.id, query.amount, query.note);
    }
    return this.merchantPosService.getPosQr(req.user);
  }

@Patch('me')
  @ApiOperation({ summary: 'Update current merchant profile' })
  @ApiResponse({ status: 200, type: Merchant })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Merchant account required' })
  async updateMe(
    @Req() req: AuthenticatedRequest,
    @Body() dto: UpdateMerchantDto,
  ): Promise<Merchant> {
    const updated = await this.merchantsService.updateMe(req.user, dto);
    // Invalidate POS QR cache on update (username change etc.)
    const merchant = await this.merchantsService.getMe(req.user);
    await this.merchantPosService.regenerate(merchant.id);
    return updated;
  }

  @Post('me/pos-qr/regenerate')
  @ApiOperation({ summary: 'Force regenerate persistent POS QR (invalidate Redis cache)' })
  @ApiResponse({ status: 200, description: 'Cache invalidated' })
  @ApiResponse({ status: 403, description: 'Merchant account required' })
  async regeneratePosQr(@Req() req: AuthenticatedRequest): Promise<{ success: true }> {
    const merchant = await this.merchantsService.getMe(req.user);
    await this.merchantPosService.regenerate(merchant.id);
    return { success: true };
  }

@Public()
  @Get(':username')
  @ApiOperation({ summary: 'Public merchant profile for pay pages' })
  @ApiResponse({ status: 200, type: MerchantPublicProfileDto })
  @ApiResponse({ status: 404, description: 'Merchant not found' })
  getPublicByUsername(
    @Param('username') username: string,
  ): Promise<MerchantPublicProfileDto> {
    return this.merchantsService.getPublicByUsername(username);
  }

  @Public()
  @Get(':username/pay')
  @ApiOperation({ summary: 'Public merchant data for QR scan landing page' })
  @ApiResponse({ status: 200, type: MerchantPublicProfileDto })
  @ApiResponse({ status: 404, description: 'Merchant not found' })
  getPayPage(
    @Param('username') username: string,
  ): Promise<MerchantPublicProfileDto> {
    return this.merchantsService.getPublicByUsername(username);
  }
}
