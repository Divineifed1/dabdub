import { Entity, Column } from 'typeorm';
import { BaseEntity } from '../../database/entities/base.entity';
import { MaintenanceType, MaintenanceStatus } from '../enums/maintenance.enums';

@Entity('maintenance_windows')
export class MaintenanceWindow extends BaseEntity {
  @Column()
  title: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'enum', enum: MaintenanceType })
  type: MaintenanceType;

  @Column({ type: 'enum', enum: MaintenanceStatus })
  status: MaintenanceStatus;

  @Column({ type: 'timestamptz' })
  scheduledStartAt: Date;

  @Column({ type: 'timestamptz' })
  scheduledEndAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  actualStartAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  actualEndAt: Date | null;

  @Column({ type: 'jsonb', default: [] })
  affectedServices: string[];

  @Column({ type: 'boolean', default: true })
  notifyMerchants: boolean;

  @Column({ type: 'boolean', default: false })
  blockNewTransactions: boolean;

  @Column({ type: 'boolean', default: false })
  pauseSettlements: boolean;

  @Column()
  createdById: string;

  @Column({ nullable: true })
  cancelledById: string | null;

  @Column({ type: 'text', nullable: true })
  cancellationReason: string | null;
}
