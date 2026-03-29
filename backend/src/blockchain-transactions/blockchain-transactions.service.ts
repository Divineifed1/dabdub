import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere } from 'typeorm';
import {
  BlockchainTransaction,
  BlockchainTransactionStatus,
  BlockchainTransactionType,
} from './entities/blockchain-transaction.entity';
import { CreateBlockchainTransactionDto } from './dto/create-blockchain-transaction.dto';
import { QueryBlockchainTransactionDto } from './dto/query-blockchain-transaction.dto';
import {
  BlockchainTransactionResponseDto,
  PaginatedBlockchainTransactionsDto,
} from './dto/blockchain-transaction-response.dto';

@Injectable()
export class BlockchainTransactionsService {
  private readonly PAGE_SIZE = 20;

  constructor(
    @InjectRepository(BlockchainTransaction)
    private readonly blockchainTransactionRepo: Repository<BlockchainTransaction>,
  ) {}

  async create(
    dto: CreateBlockchainTransactionDto,
  ): Promise<BlockchainTransactionResponseDto> {
    if (dto.status && dto.status !== BlockchainTransactionStatus.PENDING) {
      throw new ConflictException('New blockchain tx must start as pending');
    }

    if (dto.referenceId == null) {
      throw new ConflictException('referenceId is required');
    }

    const transaction = this.blockchainTransactionRepo.create({
      userId: dto.userId,
      type: dto.type,
      txHash: null,
      status: BlockchainTransactionStatus.PENDING,
      fromAddress: dto.fromAddress,
      toAddress: dto.toAddress || null,
      amountUsdc: dto.amountUsdc,
      feeStroops: dto.feeStroops || null,
      ledger: null,
      errorMessage: dto.errorMessage || null,
      referenceId: dto.referenceId,
      confirmedAt: null,
    });

    const saved = await this.blockchainTransactionRepo.save(transaction);
    return BlockchainTransactionResponseDto.fromEntity(saved);
  }

  async updateStatus(
    id: string,
    txHash: string | null,
    status: BlockchainTransactionStatus,
    ledger?: number | null,
  ): Promise<BlockchainTransactionResponseDto> {
    const tx = await this.blockchainTransactionRepo.findOne({ where: { id } });
    if (!tx) {
      throw new NotFoundException(`Blockchain transaction ${id} not found`);
    }

    if (
      tx.status === BlockchainTransactionStatus.CONFIRMED &&
      status !== BlockchainTransactionStatus.CONFIRMED
    ) {
      return BlockchainTransactionResponseDto.fromEntity(tx);
    }

    if (txHash) {
      const existing = await this.findByTxHash(txHash);
      if (existing && existing.id !== tx.id) {
        throw new ConflictException('txHash already assigned to another transaction');
      }
    }

    tx.status = status;
    if (txHash) {
      tx.txHash = txHash;
    }

    if (status === BlockchainTransactionStatus.CONFIRMED) {
      tx.confirmedAt = new Date();
      tx.ledger = ledger ?? tx.ledger;
    }

    if (ledger != null) {
      tx.ledger = ledger;
    }

    const saved = await this.blockchainTransactionRepo.save(tx);
    return BlockchainTransactionResponseDto.fromEntity(saved);
  }

  async findByReference(referenceId: string): Promise<BlockchainTransaction[]> {
    return this.blockchainTransactionRepo.find({ where: { referenceId } });
  }

  async findByTxHash(txHash: string): Promise<BlockchainTransaction | null> {
    if (!txHash) return null;
    return this.blockchainTransactionRepo.findOne({ where: { txHash } });
  }

  async findByUserId(
    userId: string,
    query: QueryBlockchainTransactionDto,
  ): Promise<PaginatedBlockchainTransactionsDto> {
    const where: FindOptionsWhere<BlockchainTransaction> = { userId } as any;

    if (query.type) {
      where.type = query.type;
    }
    if (query.status) {
      where.status = query.status;
    }

    const skip = (query.page - 1) * query.limit;

    const [items, total] = await this.blockchainTransactionRepo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip,
      take: query.limit,
    });

    return {
      items,
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  async findOneForUser(id: string, userId: string): Promise<BlockchainTransaction> {
    const tx = await this.blockchainTransactionRepo.findOne({
      where: { id, userId },
    });
    if (!tx) {
      throw new NotFoundException('Blockchain transaction not found');
    }
    return tx;
  }
}
