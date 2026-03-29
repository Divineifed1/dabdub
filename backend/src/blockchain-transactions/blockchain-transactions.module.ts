import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BlockchainTransaction } from './entities/blockchain-transaction.entity';
import { BlockchainTransactionsService } from './blockchain-transactions.service';
import { BlockchainTransactionsController } from './blockchain-transactions.controller';

@Module({
  imports: [TypeOrmModule.forFeature([BlockchainTransaction])],
  providers: [BlockchainTransactionsService],
  controllers: [BlockchainTransactionsController],
  exports: [BlockchainTransactionsService],
})
export class BlockchainTransactionsModule {}
