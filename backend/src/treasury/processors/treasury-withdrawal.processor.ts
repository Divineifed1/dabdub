import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TreasuryWithdrawal } from '../entities/treasury-withdrawal.entity';
import { PlatformWallet } from '../entities/platform-wallet.entity';
import { WithdrawalStatus } from '../enums/withdrawal-status.enum';
import { EVMService } from '../../evm/evm.service';
import { ConfigService } from '@nestjs/config';
import { parseUnits } from 'viem';

@Processor('treasury-withdrawal')
export class TreasuryWithdrawalProcessor {
  private readonly logger = new Logger(TreasuryWithdrawalProcessor.name);

  constructor(
    @InjectRepository(TreasuryWithdrawal)
    private withdrawalRepo: Repository<TreasuryWithdrawal>,
    @InjectRepository(PlatformWallet)
    private platformWalletRepo: Repository<PlatformWallet>,
    private evmService: EVMService,
    private configService: ConfigService,
  ) {}

  @Process('execute-withdrawal')
  async handleWithdrawal(job: Job<{ withdrawalId: string }>) {
    const { withdrawalId } = job.data;
    this.logger.log(`Processing withdrawal ${withdrawalId}`);

    const withdrawal = await this.withdrawalRepo.findOne({ where: { id: withdrawalId } });
    if (!withdrawal || withdrawal.status !== WithdrawalStatus.APPROVED) {
      this.logger.warn(`Withdrawal ${withdrawalId} not found or not approved`);
      return;
    }

    try {
      withdrawal.status = WithdrawalStatus.PROCESSING;
      await this.withdrawalRepo.save(withdrawal);

      const chainId = this.getChainIdFromName(withdrawal.chain);
      const privateKey = this.configService.get<string>('TREASURY_WALLET_PRIVATE_KEY');
      
      if (!privateKey) {
        throw new Error('Treasury wallet private key not configured');
      }

      const amountInSmallestUnit = parseUnits(withdrawal.tokenAmount, 6).toString();

      const txHash = await this.evmService.sendUSDCTransaction(
        chainId,
        privateKey,
        withdrawal.toAddress,
        amountInSmallestUnit,
      );

      withdrawal.txHash = txHash;
      withdrawal.status = WithdrawalStatus.COMPLETED;
      withdrawal.completedAt = new Date();

      await this.withdrawalRepo.save(withdrawal);

      const wallet = await this.platformWalletRepo.findOne({ where: { chain: withdrawal.chain } });
      if (wallet) {
        wallet.totalWithdrawnAllTime = (
          parseFloat(wallet.totalWithdrawnAllTime) + parseFloat(withdrawal.tokenAmount)
        ).toString();
        wallet.lastWithdrawalAt = new Date();
        await this.platformWalletRepo.save(wallet);
      }

      this.logger.log(`Withdrawal ${withdrawalId} completed with tx ${txHash}`);
    } catch (error: any) {
      this.logger.error(`Withdrawal ${withdrawalId} failed: ${error.message}`);
      withdrawal.status = WithdrawalStatus.FAILED;
      await this.withdrawalRepo.save(withdrawal);
      throw error;
    }
  }

  private getChainIdFromName(chain: string): number {
    const chainIds: Record<string, number> = {
      polygon: 137,
      base: 8453,
      celo: 42220,
      arbitrum: 42161,
      optimism: 10,
    };
    return chainIds[chain] || 1;
  }
}
