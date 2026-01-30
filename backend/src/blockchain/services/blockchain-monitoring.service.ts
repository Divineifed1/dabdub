import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { BlockchainNetwork } from '../entities/blockchain-network.entity';
import { BlockchainBlockCursor } from '../entities/blockchain-block-cursor.entity';
import {
  PaymentRequest,
  PaymentRequestStatus,
} from '../entities/payment-request.entity';
import { StellarClientService } from './stellar-client.service';
import {
  BlockchainBlock,
  BlockchainTransaction,
} from '../interfaces/blockchain-client.interface';

@Injectable()
export class BlockchainMonitoringService {
  private readonly logger = new Logger(BlockchainMonitoringService.name);

  constructor(
    @InjectRepository(BlockchainNetwork)
    private readonly networkRepository: Repository<BlockchainNetwork>,
    @InjectRepository(BlockchainBlockCursor)
    private readonly cursorRepository: Repository<BlockchainBlockCursor>,
    @InjectRepository(PaymentRequest)
    private readonly paymentRequestRepository: Repository<PaymentRequest>,
    private readonly stellarClient: StellarClientService,
  ) {}

  async monitorNetwork(networkId: string) {
    const network = await this.networkRepository.findOne({
      where: { id: networkId, isActive: true },
    });
    if (!network) {
      this.logger.warn(`Network ${networkId} not found or inactive.`);
      return;
    }

    try {
      const latestBlock = await this.stellarClient.getLatestBlockNumber();
      let cursor = await this.cursorRepository.findOne({
        where: { networkId },
      });

      if (!cursor) {
        cursor = this.cursorRepository.create({
          networkId,
          lastProcessedBlock: (latestBlock - 1n).toString(),
        });
        await this.cursorRepository.save(cursor);
      }

      const startBlock = BigInt(cursor.lastProcessedBlock) + 1n;
      const endBlock = latestBlock;

      if (startBlock > endBlock) {
        return;
      }

      this.logger.log(
        `Scanning network ${network.name} from block ${startBlock} to ${endBlock}`,
      );

      for (let i = startBlock; i <= endBlock; i++) {
        await this.processBlock(network, i);
        cursor.lastProcessedBlock = i.toString();
        await this.cursorRepository.save(cursor);
      }
    } catch (error) {
      this.logger.error(`Error monitoring network ${network.name}:`, error);
      throw error;
    }
  }

  private async processBlock(network: BlockchainNetwork, blockNumber: bigint) {
    const block = await this.stellarClient.getBlock(blockNumber);
    if (!block.transactions || block.transactions.length === 0) return;

    for (const tx of block.transactions) {
      await this.matchTransaction(network, tx);
    }
  }

  private async matchTransaction(
    network: BlockchainNetwork,
    tx: BlockchainTransaction,
  ) {
    // Logic to match transaction with a pending PaymentRequest
    // Matching rules: toAddress, amount, and memo (paymentReference)
    const paymentRequest = await this.paymentRequestRepository.findOne({
      where: {
        networkId: network.id,
        recipientAddress: tx.to,
        paymentReference: tx.memo,
        status: PaymentRequestStatus.PENDING,
      },
    });

    if (paymentRequest) {
      // Basic amount validation (simplification for this task)
      // In real scenarios, consider decimals and dust
      if (paymentRequest.amount.toString() === tx.amount) {
        this.logger.log(
          `Match found for PaymentRequest ${paymentRequest.id} on network ${network.name}`,
        );
        paymentRequest.status = PaymentRequestStatus.COMPLETED;
        paymentRequest.txHash = tx.hash;
        paymentRequest.blockNumber = tx.blockNumber;
        await this.paymentRequestRepository.save(paymentRequest);
      }
    }
  }

  async getMetrics(networkId: string) {
    const cursor = await this.cursorRepository.findOne({
      where: { networkId },
    });
    const completedCount = await this.paymentRequestRepository.count({
      where: { networkId, status: PaymentRequestStatus.COMPLETED },
    });
    return {
      lastProcessedBlock: cursor?.lastProcessedBlock || '0',
      completedPayments: completedCount,
    };
  }
}
