import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationsModule } from '../notifications/notifications.module';
import { User } from '../users/entities/user.entity';
import { Merchant } from './entities/merchant.entity';
import { QrModule } from '../qr/qr.module';
import { MerchantPosService } from './merchant-pos.service';
import { MerchantsAdminController } from './merchants-admin.controller';
import { MerchantsController } from './merchants.controller';
import { MerchantsService } from './merchants.service';

@Module({
  imports: [TypeOrmModule.forFeature([Merchant, User]), NotificationsModule, QrModule],
  controllers: [MerchantsController, MerchantsAdminController],
  providers: [MerchantsService, MerchantPosService],
  exports: [MerchantsService, MerchantPosService],
})
export class MerchantsModule {}
