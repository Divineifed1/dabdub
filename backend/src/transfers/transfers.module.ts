import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { Transfer } from './entities/transfer.entity';
import { Transaction } from '../transactions/entities/transaction.entity';
import { TransfersService, TRANSFER_QUEUE } from './transfers.service';
import { TransfersController } from './transfers.controller';
import { TransferProcessor } from './processors/transfer.processor';
import { SorobanModule } from '../soroban/soroban.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { UsersModule } from '../users/users.module';
import { TierConfigModule } from '../tier-config/tier-config.module';
import { WsModule } from '../ws/ws.module';
import { EmailModule } from '../email/email.module';
import { PinModule } from '../pin/pin.module';
import { COMPLIANCE_QUEUE } from '../compliance/compliance.service';
import { FeesModule } from '../fees/fees.module';
import { P2pLimitService } from './p2p-limit.service';
import { User } from '../users/entities/user.entity';
import { Merchant } from '../merchants/entities/merchant.entity';
import { ComplianceEvent } from '../compliance/entities/compliance-event.entity';
import { FraudFlag } from '../fraud/entities/fraud-flag.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Transfer,
      Transaction,
      User,
      Merchant,
      ComplianceEvent,
      FraudFlag,
    ]),
    BullModule.registerQueue({ name: TRANSFER_QUEUE }),
    BullModule.registerQueue({ name: COMPLIANCE_QUEUE }),
    SorobanModule,
    NotificationsModule,
    UsersModule,
    TierConfigModule,
    WsModule,
    EmailModule,
    PinModule,
    FeesModule,
  ],
  controllers: [TransfersController],
  providers: [TransfersService, TransferProcessor, P2pLimitService],
  exports: [TransfersService],
})
export class TransfersModule {}
