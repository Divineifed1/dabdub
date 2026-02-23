import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PlatformWallet } from '../entities/platform-wallet.entity';

@Injectable()
export class FeeHistoryService {
  constructor(
    @InjectRepository(PlatformWallet)
    private platformWalletRepo: Repository<PlatformWallet>,
  ) {}

  async getFeeHistory(chain: string, granularity: string = 'day') {
    // This is a simplified implementation
    // In production, you'd query a separate fee_collection_history table
    // For now, return mock data structure
    return {
      chain,
      granularity,
      series: [
        { date: '2026-02-18', feesCollectedUsd: '1234.50', transactionCount: 412 },
        { date: '2026-02-17', feesCollectedUsd: '987.30', transactionCount: 325 },
      ],
    };
  }
}
