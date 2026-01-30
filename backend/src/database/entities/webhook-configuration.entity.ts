import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  OneToMany,
} from 'typeorm';
import { WebhookDeliveryLogEntity } from './webhook-delivery-log.entity';

export enum WebhookEvent {
  PAYMENT_REQUEST_CREATED = 'payment_request.created',
  PAYMENT_REQUEST_UPDATED = 'payment_request.updated',
  PAYMENT_REQUEST_COMPLETED = 'payment_request.completed',
  PAYMENT_REQUEST_FAILED = 'payment_request.failed',
  SETTLEMENT_COMPLETED = 'settlement.completed',
  SETTLEMENT_FAILED = 'settlement.failed',
}

@Entity('webhook_configurations')
@Index(['isActive'])
@Index(['createdAt'])
export class WebhookConfigurationEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'merchant_id', type: 'uuid' })
  merchantId!: string;

  @Column({ type: 'varchar', length: 500 })
  url!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  secret?: string;

  @Column({
    type: 'simple-array',
    enum: WebhookEvent,
  })
  events!: WebhookEvent[];

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ name: 'failure_count', type: 'int', default: 0 })
  failureCount!: number;

  @Column({ name: 'last_delivered_at', type: 'timestamp', nullable: true })
  lastDeliveredAt?: Date;

  @Column({ name: 'last_failed_at', type: 'timestamp', nullable: true })
  lastFailedAt?: Date;

  @Column({ name: 'disabled_at', type: 'timestamp', nullable: true })
  disabledAt?: Date;

  @Column({
    name: 'disabled_reason',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  disabledReason?: string;

  @Column({ name: 'max_failure_count', type: 'int', default: 5 })
  maxFailureCount!: number;

  @Column({ name: 'batch_enabled', type: 'boolean', default: false })
  batchEnabled!: boolean;

  @Column({ name: 'batch_max_size', type: 'int', default: 20 })
  batchMaxSize!: number;

  @Column({ name: 'batch_window_ms', type: 'int', default: 2000 })
  batchWindowMs!: number;

  @Column({ name: 'retry_attempts', type: 'int', default: 3 })
  retryAttempts!: number;

  @Column({ name: 'retry_delay_ms', type: 'int', default: 1000 })
  retryDelayMs!: number;

  @Column({ name: 'timeout_ms', type: 'int', default: 5000 })
  timeoutMs!: number;

  @CreateDateColumn({
    name: 'created_at',
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
  })
  createdAt!: Date;

  @UpdateDateColumn({
    name: 'updated_at',
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
    onUpdate: 'CURRENT_TIMESTAMP',
  })
  updatedAt!: Date;

  @OneToMany(() => WebhookDeliveryLogEntity, (log) => log.webhookConfiguration)
  deliveryLogs!: WebhookDeliveryLogEntity[];
}
