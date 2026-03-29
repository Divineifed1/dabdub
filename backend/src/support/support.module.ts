import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { SupportTicket } from './entities/support-ticket.entity';
import { TicketMessage } from './entities/ticket-message.entity';
import { SupportService } from './support.service';
import { SupportController } from './support.controller';
import { SupportAdminController } from './support-admin.controller';
import { SupportProcessor } from './support.processor';
import { EmailModule } from '../email/email.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { UsersModule } from '../users/users.module';
import { TransactionsModule } from '../transactions/transactions.module';
import { AdminModule } from '../admin/admin.module';

export const SUPPORT_QUEUE = 'support-jobs';

@Module({
  imports: [
    TypeOrmModule.forFeature([SupportTicket, TicketMessage]),
    BullModule.registerQueue({
      name: SUPPORT_QUEUE,
    }),
    EmailModule,
    NotificationsModule,
    UsersModule,
    TransactionsModule,
    AdminModule,
  ],
  controllers: [SupportController, SupportAdminController],
  providers: [SupportService, SupportProcessor],
  exports: [SupportService],
})
export class SupportModule {}

