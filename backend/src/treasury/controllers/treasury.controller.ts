import { Controller, Get, Post, Delete, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import { TreasuryService } from '../services/treasury.service';
import { FeeHistoryService } from '../services/fee-history.service';
import { SuperAdminGuard } from '../../auth/guards/super-admin.guard';
import { AdminJwtGuard } from '../../auth/guards/admin-jwt.guard';
import { AddWhitelistAddressDto, RequestTreasuryWithdrawalDto, RejectWithdrawalDto, WithdrawalFilterDto } from '../dto/treasury.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity, UserRole } from '../../database/entities/user.entity';

@Controller('api/v1/treasury')
@UseGuards(AdminJwtGuard)
export class TreasuryController {
  constructor(
    private treasuryService: TreasuryService,
    private feeHistoryService: FeeHistoryService,
    @InjectRepository(UserEntity)
    private userRepo: Repository<UserEntity>,
  ) {}

  @Get('wallets')
  async getWallets(@Req() req: any) {
    return this.treasuryService.getWalletsWithBalances(req.user.id);
  }

  @Get('wallets/:chain/history')
  async getFeeHistory(@Param('chain') chain: string, @Query('granularity') granularity?: string) {
    return this.feeHistoryService.getFeeHistory(chain, granularity);
  }

  @Get('whitelist')
  @UseGuards(SuperAdminGuard)
  async getWhitelist() {
    return this.treasuryService.getWhitelist();
  }

  @Post('whitelist')
  @UseGuards(SuperAdminGuard)
  async addWhitelist(@Body() dto: AddWhitelistAddressDto, @Req() req: any) {
    return this.treasuryService.addWhitelistAddress(dto, req.user.id);
  }

  @Delete('whitelist/:id')
  @UseGuards(SuperAdminGuard)
  async removeWhitelist(@Param('id') id: string, @Req() req: any) {
    await this.treasuryService.removeWhitelistAddress(id, req.user.id);
    return { message: 'Address removed from whitelist' };
  }

  @Post('withdrawals')
  @UseGuards(SuperAdminGuard)
  async requestWithdrawal(@Body() dto: RequestTreasuryWithdrawalDto, @Req() req: any) {
    const superAdminCount = await this.userRepo.count({ where: { role: UserRole.SUPER_ADMIN } });
    return this.treasuryService.requestWithdrawal(dto, req.user.id, superAdminCount);
  }

  @Post('withdrawals/:id/approve')
  @UseGuards(SuperAdminGuard)
  async approveWithdrawal(@Param('id') id: string, @Req() req: any) {
    return this.treasuryService.approveWithdrawal(id, req.user.id);
  }

  @Post('withdrawals/:id/reject')
  @UseGuards(SuperAdminGuard)
  async rejectWithdrawal(@Param('id') id: string, @Body() dto: RejectWithdrawalDto, @Req() req: any) {
    return this.treasuryService.rejectWithdrawal(id, req.user.id, dto.rejectionReason);
  }

  @Get('withdrawals')
  async getWithdrawals(@Query() filters: WithdrawalFilterDto) {
    return this.treasuryService.getWithdrawals(filters);
  }

  @Get('withdrawals/:id')
  async getWithdrawal(@Param('id') id: string) {
    return this.treasuryService.getWithdrawalById(id);
  }
}
