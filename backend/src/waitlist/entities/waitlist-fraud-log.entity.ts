import { Entity, Column, Index, CreateDateColumn } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';

export enum FraudAction {
  BLOCKED = 'blocked',
  FLAGGED = 'flagged',
  ALLOWED = 'allowed',
}

@Entity('waitlist_fraud_logs')
@Index(['email'])
@Index(['ip'])
@Index(['rule'])
@Index(['action'])
export class WaitlistFraudLog extends BaseEntity {
  @Column({ length: 255 })
  email!: string;

  @Column({ length: 45 })
  ip!: string;

  @Column({ length: 100 })
  rule!: string;

  @Column({
    type: 'enum',
    enum: FraudAction,
    default: FraudAction.FLAGGED,
  })
  action!: FraudAction;

  @Column({ type: 'jsonb', nullable: true })
  details!: Record<string, any> | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
