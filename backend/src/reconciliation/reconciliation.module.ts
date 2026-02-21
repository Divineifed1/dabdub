import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { Reconciliation } from './reconciliation.entity';
import { ReconciliationService } from './reconciliation.service';
import { ReconciliationController } from './reconciliation.controller';
import { Transaction } from '../transactions/entities/transaction.entity';
import { Settlement } from '../settlement/entities/settlement.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Reconciliation, Transaction, Settlement]),
    ScheduleModule,
  ],
  controllers: [ReconciliationController],
  providers: [ReconciliationService],
  exports: [ReconciliationService],
})
export class ReconciliationModule {}
