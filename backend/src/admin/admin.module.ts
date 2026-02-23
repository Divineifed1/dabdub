import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { MerchantsModule } from './merchants/merchants.module';
import { HealthModule } from '../health/health.module';
import { AuditModule } from '../audit/audit.module';
import { Merchant } from '../database/entities/merchant.entity';
import { Payment } from '../database/entities/payment.entity';
import { Settlement } from '../settlement/entities/settlement.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Merchant, Payment, Settlement]),
    MerchantsModule,
    HealthModule,
    AuditModule,
  ],
  controllers: [AdminController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
