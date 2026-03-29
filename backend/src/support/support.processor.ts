import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { SupportTicket, TicketPriority, TicketStatus as TicketStatusEnum } from './entities/support-ticket.entity';
import { EmailService } from '../email/email.service';
import { NotificationService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/notifications.types';

@Injectable()
export class SupportProcessor {
  constructor(
    @InjectRepository(SupportTicket)
    private readonly ticketRepo: Repository<SupportTicket>,
    private readonly emailService: EmailService,
    private readonly notificationService: NotificationService,
  ) {}

  @Cron(CronExpression.EVERY_30_MINUTES)
  async checkEscalations() {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const urgentTickets = await this.ticketRepo.find({
      where: {
        status: TicketStatus.OPEN,
        priority: TicketPriority.URGENT,
        createdAt: LessThan(twoHoursAgo),
      },
    });

    for (const ticket of urgentTickets) {
      // Notify superadmin
      await this.notificationService.create(
        'system-superadmin', // TODO: query actual superadmin ID
        NotificationType.SYSTEM,
        `URGENT ESCALATION: ${ticket.ticketNumber}`,
        `Ticket open >2h: ${ticket.subject} (${ticket.userId})`,
      );

      // Email alert
      const user = { email: 'alerts@cheese.com' }; // TODO: get superadmin email
      await this.emailService.queue(
        user.email,
        'SUPPORT_ESCALATED',
        { ticketNumber: ticket.ticketNumber, url: `/admin/support/tickets/${ticket.id}` },
      );
    }
  }
}

