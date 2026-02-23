import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { TreasuryController } from './controllers/treasury.controller';
import { TreasuryService } from './services/treasury.service';
import { FeeHistoryService } from './services/fee-history.service';
import { TreasuryWithdrawalProcessor } from './processors/treasury-withdrawal.processor';
import { PlatformWallet } from './entities/platform-wallet.entity';
import { TreasuryWithdrawal } from './entities/treasury-withdrawal.entity';
import { TreasuryWhitelistAddress } from './entities/treasury-whitelist-address.entity';
import { UserEntity } from '../database/entities/user.entity';
import { EVMModule } from '../evm/evm.module';
import { ExchangeRateModule } from '../exchange-rate/exchange-rate.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PlatformWallet,
      TreasuryWithdrawal,
      TreasuryWhitelistAddress,
      UserEntity,
    ]),
    BullModule.registerQueue({ name: 'treasury-withdrawal' }),
    EVMModule,
    ExchangeRateModule,
    AuditModule,
  ],
  controllers: [TreasuryController],
  providers: [TreasuryService, FeeHistoryService, TreasuryWithdrawalProcessor],
  exports: [TreasuryService],
})
export class TreasuryModule {}
