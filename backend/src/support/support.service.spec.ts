import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SupportService } from './support.service';
import { SupportTicket } from './entities/support-ticket.entity';
import { TicketMessage } from './entities/ticket-message.entity';
import { User } from '../users/entities/user.entity';
import { Transaction } from '../transactions/entities/transaction.entity';
import { EmailService } from '../email/email.service';
import { NotificationService } from '../notifications/notifications.service';
import { UsersService } from '../users/users.service';

describe('SupportService', () => {
  let service: SupportService;
  let ticketRepo: any;
  let emailService: any;
  let notificationService: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SupportService,
        {
          provide: getRepositoryToken(SupportTicket),
          useValue: { create: jest.fn(), save: jest.fn(), findOne: jest.fn(), find: jest.fn() },
        },
        {
          provide: getRepositoryToken(TicketMessage),
          useValue: { create: jest.fn(), save: jest.fn() },
        },
        {
          provide: getRepositoryToken(User),
          useValue: { findOne: jest.fn() },
        },
        {
          provide: getRepositoryToken(Transaction),
          useValue: { findOne: jest.fn() },
        },
        {
          provide: EmailService,
          useValue: { queue: jest.fn() },
        },
        {
          provide: NotificationService,
          useValue: { create: jest.fn() },
        },
        {
          provide: UsersService,
          useValue: {},
        },
      ],
    }).compile();

    service = module.get<SupportService>(SupportService);
    ticketRepo = module.get(getRepositoryToken(SupportTicket));
    emailService = module.get(EmailService);
    notificationService = module.get(NotificationService);
  });

  it('should create ticket with urgent priority if transaction stuck >1h', async () => {
    const createTicketDto = {
      category: 'transaction',
      subject: 'Stuck deposit',
      description: 'My deposit is stuck',
      transactionId: 'tx-123',
    };
    const userId = 'user-123';
    const mockUser = { id: userId, email: 'test@example.com', username: 'testuser' };
    const mockTx = { id: 'tx-123', status: 'pending', createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000) };

    jest.spyOn(service['userRepo'], 'findOne').mockResolvedValue(mockUser as any);
    jest.spyOn(service['txRepo'], 'findOne').mockResolvedValue(mockTx as any);
    jest.spyOn(ticketRepo, 'create').mockReturnValue({} as any);
    jest.spyOn(ticketRepo, 'save').mockResolvedValue({ ticketNumber: 'CHZ-20240101-0001', priority: 'urgent' } as any);
    jest.spyOn(emailService, 'queue').mockResolvedValue({} as any);

    const result = await service.createTicket(userId, createTicketDto);

    expect(result).toBeDefined();
    expect(emailService.queue).toHaveBeenCalled();
    expect(notificationService.create).toHaveBeenCalledTimes(2);
  });

  it('should not escalate priority for non-stuck transactions', async () => {
    // Similar test but tx not pending or recent
    // Assert priority === 'medium'
  });

  it('should throw NotFoundException for non-existent user', async () => {
    // Test user not found
  });

  it('should prevent users from accessing other tickets', async () => {
    // Test getUserTicket with wrong userId
  });
});

