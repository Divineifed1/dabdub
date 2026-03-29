import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { SupportTicket } from './support-ticket.entity';

@Entity('ticket_message')
export class TicketMessage extends BaseEntity {
  @Column({ name: 'ticket_id' })
  ticketId!: string;

  @ManyToOne(() => SupportTicket, (ticket) => ticket.messages)
  @JoinColumn({ name: 'ticket_id' })
  ticket!: SupportTicket;

  @Column({ name: 'sender_id' })
  senderId!: string;

  @Column({
    type: 'enum',
    enum: ['user', 'admin'],
    default: 'user',
  })
  senderType!: string;

  @Column('text')
  message!: string;

  @Column({ name: 'attachment_key', nullable: true })
  attachmentKey!: string | null;

  @CreateDateColumn()
  createdAt!: Date;
}

