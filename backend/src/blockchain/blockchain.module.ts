import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BlockchainNetwork } from './entities/blockchain-network.entity';
import { BlockchainBlockCursor } from './entities/blockchain-block-cursor.entity';
import { PaymentRequest } from './entities/payment-request.entity';
import { BlockchainMonitoringService } from './services/blockchain-monitoring.service';
import { StellarClientService } from './services/stellar-client.service';
import { BlockchainMonitoringJob } from './jobs/blockchain-monitoring.job';
import { BlockchainMonitoringController } from './controllers/blockchain-monitoring.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      BlockchainNetwork,
      BlockchainBlockCursor,
      PaymentRequest,
    ]),
  ],
  controllers: [BlockchainMonitoringController],
  providers: [
    BlockchainMonitoringService,
    StellarClientService,
    BlockchainMonitoringJob,
  ],
  exports: [BlockchainMonitoringService, BlockchainMonitoringJob],
})
export class BlockchainModule {}
