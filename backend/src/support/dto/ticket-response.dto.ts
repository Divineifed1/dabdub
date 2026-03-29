import { Exclude, Expose } from 'class-transformer';
import { SupportTicket } from '../entities/support-ticket.entity';
import { TicketMessage } from '../entities/ticket-message.entity';

@Exclude()
export class TicketResponseDto {
  @Expose()
  id!: string;

  @Expose()
  ticketNumber!: string;

  @Expose()
  category!: string;

  @Expose()
  subject!: string;

  @Expose()
  status!: string;

  @Expose()
  priority!: string;

  @Expose()
  assignedTo?: string;

  @Expose()
  transactionId?: string;

  @Expose()
  createdAt!: Date;

  @Expose()
  updatedAt!: Date;

  @Expose()
  messages: TicketMessageResponseDto[];

  constructor(ticket: SupportTicket) {
    this.id = ticket.id;
    this.ticketNumber = ticket.ticketNumber;
    this.category = ticket.category;
    this.subject = ticket.subject;
    this.status = ticket.status;
    this.priority = ticket.priority;
    this.assignedTo = ticket.assignedTo || undefined;
    this.transactionId = ticket.transactionId || undefined;
    this.createdAt = ticket.createdAt;
    this.updatedAt = ticket.updatedAt;
    this.messages = ticket.messages.map((m) => new TicketMessageResponseDto(m));
  }
}

@Exclude()
export class TicketMessageResponseDto {
  @Expose()
  id!: string;

  @Expose()
  senderId!: string;

  @Expose()
  senderType!: string;

  @Expose()
  message!: string;

  @Expose()
  attachmentKey?: string;

  @Expose()
  createdAt!: Date;

  constructor(message: TicketMessage) {
    this.id = message.id;
    this.senderId = message.senderId;
    this.senderType = message.senderType;
    this.message = message.message;
    this.attachmentKey = message.attachmentKey || undefined;
    this.createdAt = message.createdAt;
  }
}

