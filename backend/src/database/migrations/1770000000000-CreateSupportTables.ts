import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSupportTables1770000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE ticket_category AS ENUM ('transaction', 'account', 'kyc', 'withdrawal', 'general');
      CREATE TYPE ticket_status AS ENUM ('open', 'in_progress', 'resolved', 'closed');
      CREATE TYPE ticket_priority AS ENUM ('low', 'medium', 'high', 'urgent');
      CREATE TYPE sender_type AS ENUM ('user', 'admin');
    `);

    await queryRunner.query(`
      CREATE TABLE support_ticket (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        ticket_number VARCHAR UNIQUE NOT NULL,
        category ticket_category NOT NULL,
        subject VARCHAR(100) NOT NULL,
        description TEXT NOT NULL,
        status ticket_status NOT NULL DEFAULT 'open',
        priority ticket_priority NOT NULL DEFAULT 'medium',
        assigned_to UUID REFERENCES users(id),
        transaction_id UUID REFERENCES transactions(id),
        resolved_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX idx_support_ticket_status_priority ON support_ticket(status, priority, created_at);
      CREATE INDEX idx_support_ticket_user ON support_ticket(user_id);
      CREATE INDEX idx_support_ticket_transaction ON support_ticket(transaction_id);
    `);

    await queryRunner.query(`
      CREATE TABLE ticket_message (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        ticket_id UUID NOT NULL REFERENCES support_ticket(id) ON DELETE CASCADE,
        sender_id UUID NOT NULL REFERENCES users(id),
        sender_type sender_type NOT NULL DEFAULT 'user',
        message TEXT NOT NULL,
        attachment_key VARCHAR,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE ticket_message');
    await queryRunner.query('DROP TABLE support_ticket');
    await queryRunner.query('DROP TYPE sender_type');
    await queryRunner.query('DROP TYPE ticket_priority');
    await queryRunner.query('DROP TYPE ticket_status');
    await queryRunner.query('DROP TYPE ticket_category');
  }
}

