import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { BlockchainTransactionsService } from './blockchain-transactions.service';
import {
  BlockchainTransaction,
  BlockchainTransactionStatus,
  BlockchainTransactionType,
} from './entities/blockchain-transaction.entity';
import { CreateBlockchainTransactionDto } from './dto/create-blockchain-transaction.dto';

describe('BlockchainTransactionsService', () => {
  let service: BlockchainTransactionsService;
  let repo: Repository<BlockchainTransaction>;

  const baseTx = (): BlockchainTransaction => ({
    id: 'tx1',
    userId: 'user1',
    type: BlockchainTransactionType.DEPOSIT,
    txHash: null,
    status: BlockchainTransactionStatus.PENDING,
    fromAddress: 'GA..FROM',
    toAddress: 'GA..TO',
    amountUsdc: '100.00',
    feeStroops: null,
    ledger: null,
    errorMessage: null,
    referenceId: 'ref-1',
    confirmedAt: null,
    createdAt: new Date('2025-01-01T00:00:00Z'),
    updatedAt: new Date('2025-01-01T00:00:00Z'),
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BlockchainTransactionsService,
        {
          provide: getRepositoryToken(BlockchainTransaction),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            findOne: jest.fn(),
            find: jest.fn(),
            findAndCount: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<BlockchainTransactionsService>(BlockchainTransactionsService);
    repo = module.get<Repository<BlockchainTransaction>>(getRepositoryToken(BlockchainTransaction));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('creates a pending transaction and updates to confirmed', async () => {
    const dto: CreateBlockchainTransactionDto = {
      userId: 'user1',
      type: BlockchainTransactionType.DEPOSIT,
      fromAddress: 'GA..FROM',
      toAddress: 'GA..TO',
      amountUsdc: '100.00',
      referenceId: 'ref-1',
    };

    const createdTx = baseTx();
    jest.spyOn(repo, 'create').mockReturnValue(createdTx);
    jest.spyOn(repo, 'save').mockResolvedValue(createdTx);

    const created = await service.create(dto);
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ status: BlockchainTransactionStatus.PENDING }));

    jest.spyOn(repo, 'findOne').mockResolvedValue(createdTx);
    const confirmedTx = { ...createdTx, status: BlockchainTransactionStatus.CONFIRMED, txHash: 'hash123', ledger: 1234, confirmedAt: new Date() };
    jest.spyOn(repo, 'save').mockResolvedValue(confirmedTx);

    const updated = await service.updateStatus('tx1', 'hash123', BlockchainTransactionStatus.CONFIRMED, 1234);
    expect(updated.status).toBe(BlockchainTransactionStatus.CONFIRMED);
    expect(updated.txHash).toBe('hash123');
    expect(updated.ledger).toBe(1234);
    expect(updated.confirmedAt).toBeTruthy();
  });

  it('findByTxHash returns existing record', async () => {
    const tx = baseTx();
    tx.txHash = 'hash123';
    jest.spyOn(repo, 'findOne').mockResolvedValue(tx);

    const found = await service.findByTxHash('hash123');
    expect(found).toBe(tx);
  });

  it('prevents confirmed -> pending transition', async () => {
    const tx = baseTx();
    tx.status = BlockchainTransactionStatus.CONFIRMED;
    tx.txHash = 'hash123';
    jest.spyOn(repo, 'findOne').mockResolvedValue(tx);

    const result = await service.updateStatus('tx1', null, BlockchainTransactionStatus.PENDING);
    expect(result.status).toBe(BlockchainTransactionStatus.CONFIRMED);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('supports pagination and filtering in findByUserId', async () => {
    const txs = [baseTx(), { ...baseTx(), id: 'tx2', type: BlockchainTransactionType.WITHDRAWAL }];
    jest.spyOn(repo, 'findAndCount').mockResolvedValue([txs, 2]);

    const paged = await service.findByUserId('user1', { page: 1, limit: 10, type: BlockchainTransactionType.DEPOSIT });
    expect(repo.findAndCount).toHaveBeenCalledWith({
      where: { userId: 'user1', type: BlockchainTransactionType.DEPOSIT },
      order: { createdAt: 'DESC' },
      skip: 0,
      take: 10,
    });

    expect(paged.total).toBe(2);
    expect(paged.items).toHaveLength(2);
  });

  it('throws NotFoundException for missing tx on updateStatus', async () => {
    jest.spyOn(repo, 'findOne').mockResolvedValue(null);
    await expect(service.updateStatus('invalid', 'hash', BlockchainTransactionStatus.SUBMITTED)).rejects.toThrow(NotFoundException);
  });

  it('throws ConflictException if status is not pending on create', async () => {
    const dto: CreateBlockchainTransactionDto = {
      userId: 'user1',
      type: BlockchainTransactionType.DEPOSIT,
      fromAddress: 'a',
      amountUsdc: '100',
      referenceId: 'r1',
      status: BlockchainTransactionStatus.CONFIRMED,
    };

    await expect(service.create(dto)).rejects.toThrow(ConflictException);
  });
});
