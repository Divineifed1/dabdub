import { Injectable, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { Repository, MoreThan } from 'typeorm';
import { PlatformWallet } from '../entities/platform-wallet.entity';
import { TreasuryWithdrawal } from '../entities/treasury-withdrawal.entity';
import { TreasuryWhitelistAddress } from '../entities/treasury-whitelist-address.entity';
import { WithdrawalStatus } from '../enums/withdrawal-status.enum';
import { EVMService } from '../../evm/evm.service';
import { ExchangeRateService } from '../../exchange-rate/exchange-rate.service';
import { AuditLogService } from '../../audit/audit-log.service';
import { AuditAction, ActorType } from '../../database/entities/audit-log.enums';
import { CHAIN_ID_TO_NAME } from '../../evm/evm.constants';
import { formatUnits } from 'viem';

const TIMELOCK_HOURS = 24;
const PLATFORM_WALLET_RESERVE = '100'; // Reserve 100 USDC minimum

@Injectable()
export class TreasuryService {
  constructor(
    @InjectRepository(PlatformWallet)
    private platformWalletRepo: Repository<PlatformWallet>,
    @InjectRepository(TreasuryWithdrawal)
    private withdrawalRepo: Repository<TreasuryWithdrawal>,
    @InjectRepository(TreasuryWhitelistAddress)
    private whitelistRepo: Repository<TreasuryWhitelistAddress>,
    @InjectQueue('treasury-withdrawal')
    private withdrawalQueue: Queue,
    private evmService: EVMService,
    private exchangeRateService: ExchangeRateService,
    private auditLogService: AuditLogService,
  ) {}

  async getWalletsWithBalances(userId: string) {
    const wallets = await this.platformWalletRepo.find({ where: { isActive: true } });
    const result = [];
    let grandTotal = 0;

    for (const wallet of wallets) {
      const chainId = this.getChainIdFromName(wallet.chain);
      const usdcBalance = await this.evmService.getUSDCBalance(chainId, wallet.walletAddress);
      const nativeBalance = await this.evmService.getNativeBalance(chainId, wallet.walletAddress);

      const usdcFormatted = formatUnits(BigInt(usdcBalance), 6);
      const nativeFormatted = formatUnits(BigInt(nativeBalance), 18);

      const usdcUsdValue = parseFloat(usdcFormatted);
      const nativeUsdValue = await this.exchangeRateService.convertAmount(
        parseFloat(nativeFormatted),
        this.getNativeSymbol(wallet.chain),
        'USD',
      );

      const totalUsdValue = usdcUsdValue + nativeUsdValue;
      grandTotal += totalUsdValue;

      result.push({
        chain: wallet.chain,
        walletAddress: wallet.walletAddress,
        tokens: [
          { symbol: 'USDC', balance: usdcFormatted, usdValue: usdcUsdValue.toFixed(2) },
          { symbol: this.getNativeSymbol(wallet.chain), balance: nativeFormatted, usdValue: nativeUsdValue.toFixed(2) },
        ],
        totalUsdValue: totalUsdValue.toFixed(2),
        totalFeesCollectedAllTime: wallet.totalFeesCollectedAllTime,
        totalWithdrawnAllTime: wallet.totalWithdrawnAllTime,
        lastWithdrawalAt: wallet.lastWithdrawalAt,
        lastRefreshedAt: new Date().toISOString(),
      });
    }

    return { wallets: result, grandTotalUsdValue: grandTotal.toFixed(2) };
  }

  async addWhitelistAddress(dto: any, userId: string) {
    const existing = await this.whitelistRepo.findOne({ where: { address: dto.address, isActive: true } });
    if (existing) {
      throw new BadRequestException('Address already whitelisted');
    }

    const whitelist = this.whitelistRepo.create({
      address: dto.address,
      label: dto.label,
      allowedChains: dto.allowedChains,
      addedById: userId,
    });

    const saved = await this.whitelistRepo.save(whitelist);

    await this.auditLogService.log({
      entityType: 'TreasuryWhitelistAddress',
      entityId: saved.id,
      action: AuditAction.CREATE,
      actorId: userId,
      actorType: ActorType.ADMIN,
      afterState: { address: dto.address, label: dto.label, allowedChains: dto.allowedChains },
    });

    return saved;
  }

  async removeWhitelistAddress(id: string, userId: string) {
    const whitelist = await this.whitelistRepo.findOne({ where: { id } });
    if (!whitelist) {
      throw new NotFoundException('Whitelist address not found');
    }

    const pendingWithdrawal = await this.withdrawalRepo.findOne({
      where: { toAddress: whitelist.address, status: WithdrawalStatus.PENDING_APPROVAL },
    });

    if (pendingWithdrawal) {
      throw new BadRequestException('Cannot remove address with pending withdrawal');
    }

    whitelist.isActive = false;
    whitelist.removedById = userId;
    whitelist.removedAt = new Date();

    await this.whitelistRepo.save(whitelist);

    await this.auditLogService.log({
      entityType: 'TreasuryWhitelistAddress',
      entityId: id,
      action: AuditAction.DELETE,
      actorId: userId,
      actorType: ActorType.ADMIN,
      beforeState: { address: whitelist.address },
    });
  }

  async getWhitelist() {
    return this.whitelistRepo.find({ where: { isActive: true } });
  }

  async requestWithdrawal(dto: any, userId: string, superAdminCount: number) {
    const whitelist = await this.whitelistRepo.findOne({
      where: { address: dto.toAddress, isActive: true },
    });

    if (!whitelist) {
      throw new BadRequestException('Address not in whitelist');
    }

    if (!whitelist.allowedChains.includes(dto.chain)) {
      throw new BadRequestException('Address not allowed for this chain');
    }

    const timelockExpired = new Date().getTime() - new Date(whitelist.createdAt).getTime() > TIMELOCK_HOURS * 60 * 60 * 1000;
    if (!timelockExpired) {
      throw new BadRequestException('Timelock not expired (24 hours required)');
    }

    const chainId = this.getChainIdFromName(dto.chain);
    const wallet = await this.platformWalletRepo.findOne({ where: { chain: dto.chain } });
    if (!wallet) {
      throw new NotFoundException('Platform wallet not found for chain');
    }

    const liveBalance = await this.evmService.getUSDCBalance(chainId, wallet.walletAddress);
    const liveBalanceFormatted = parseFloat(formatUnits(BigInt(liveBalance), 6));
    const requestedAmount = parseFloat(dto.tokenAmount);

    if (requestedAmount > liveBalanceFormatted - parseFloat(PLATFORM_WALLET_RESERVE)) {
      throw new BadRequestException('Insufficient balance (reserve required)');
    }

    const usdValue = await this.exchangeRateService.convertAmount(requestedAmount, dto.tokenSymbol, 'USD');

    const withdrawal = this.withdrawalRepo.create({
      chain: dto.chain,
      fromAddress: wallet.walletAddress,
      toAddress: dto.toAddress,
      tokenAmount: dto.tokenAmount,
      tokenSymbol: dto.tokenSymbol,
      usdValueAtTime: usdValue.toFixed(8),
      status: superAdminCount > 1 ? WithdrawalStatus.PENDING_APPROVAL : WithdrawalStatus.APPROVED,
      reason: dto.reason,
      requestedById: userId,
      approvedWhitelistAddresses: [dto.toAddress],
      approvedById: superAdminCount === 1 ? userId : null,
      approvedAt: superAdminCount === 1 ? new Date() : null,
    });

    const saved = await this.withdrawalRepo.save(withdrawal);

    await this.auditLogService.log({
      entityType: 'TreasuryWithdrawal',
      entityId: saved.id,
      action: AuditAction.CREATE,
      actorId: userId,
      actorType: ActorType.ADMIN,
      afterState: { chain: dto.chain, amount: dto.tokenAmount, toAddress: dto.toAddress },
    });

    return saved;
  }

  async approveWithdrawal(id: string, userId: string) {
    const withdrawal = await this.withdrawalRepo.findOne({ where: { id } });
    if (!withdrawal) {
      throw new NotFoundException('Withdrawal not found');
    }

    if (withdrawal.status !== WithdrawalStatus.PENDING_APPROVAL) {
      throw new BadRequestException('Withdrawal not pending approval');
    }

    if (withdrawal.requestedById === userId) {
      throw new ForbiddenException('Cannot approve own withdrawal request');
    }

    withdrawal.status = WithdrawalStatus.APPROVED;
    withdrawal.approvedById = userId;
    withdrawal.approvedAt = new Date();

    await this.withdrawalRepo.save(withdrawal);

    await this.withdrawalQueue.add('execute-withdrawal', { withdrawalId: id });

    await this.auditLogService.log({
      entityType: 'TreasuryWithdrawal',
      entityId: id,
      action: AuditAction.UPDATE,
      actorId: userId,
      actorType: ActorType.ADMIN,
      afterState: { status: 'APPROVED', approvedById: userId },
    });

    return withdrawal;
  }

  async rejectWithdrawal(id: string, userId: string, rejectionReason: string) {
    const withdrawal = await this.withdrawalRepo.findOne({ where: { id } });
    if (!withdrawal) {
      throw new NotFoundException('Withdrawal not found');
    }

    withdrawal.status = WithdrawalStatus.REJECTED;
    withdrawal.rejectedById = userId;
    withdrawal.rejectionReason = rejectionReason;

    await this.withdrawalRepo.save(withdrawal);

    await this.auditLogService.log({
      entityType: 'TreasuryWithdrawal',
      entityId: id,
      action: AuditAction.UPDATE,
      actorId: userId,
      actorType: ActorType.ADMIN,
      afterState: { status: 'REJECTED', rejectionReason },
    });

    return withdrawal;
  }

  async getWithdrawals(filters: any) {
    const query = this.withdrawalRepo.createQueryBuilder('w');

    if (filters.chain) query.andWhere('w.chain = :chain', { chain: filters.chain });
    if (filters.status) query.andWhere('w.status = :status', { status: filters.status });
    if (filters.createdAfter) query.andWhere('w.createdAt >= :after', { after: filters.createdAfter });
    if (filters.createdBefore) query.andWhere('w.createdAt <= :before', { before: filters.createdBefore });

    query.orderBy('w.createdAt', 'DESC');
    return query.getMany();
  }

  async getWithdrawalById(id: string) {
    const withdrawal = await this.withdrawalRepo.findOne({ where: { id } });
    if (!withdrawal) {
      throw new NotFoundException('Withdrawal not found');
    }
    return withdrawal;
  }

  private getChainIdFromName(chain: string): number {
    const entry = Object.entries(CHAIN_ID_TO_NAME).find(([id, name]) => name === chain);
    if (!entry) throw new BadRequestException(`Unknown chain: ${chain}`);
    return parseInt(entry[0]);
  }

  private getNativeSymbol(chain: string): string {
    const symbols: Record<string, string> = {
      polygon: 'MATIC',
      base: 'ETH',
      celo: 'CELO',
      arbitrum: 'ETH',
      optimism: 'ETH',
    };
    return symbols[chain] || 'ETH';
  }
}
