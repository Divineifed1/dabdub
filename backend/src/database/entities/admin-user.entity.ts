import {
  Entity,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { BaseEntity } from './base.entity';

export enum AdminRole {
  READONLY_ADMIN = 'READONLY_ADMIN',
  SUPPORT_ADMIN = 'SUPPORT_ADMIN',
  OPERATIONS_ADMIN = 'OPERATIONS_ADMIN',
  FINANCE_ADMIN = 'FINANCE_ADMIN',
  SUPER_ADMIN = 'SUPER_ADMIN',
}

export enum AdminStatus {
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  LOCKED = 'LOCKED',
  PENDING_SETUP = 'PENDING_SETUP',
}

/** Role-to-permissions map for admin users (admin_users table). */
export const ADMIN_ROLE_PERMISSIONS: Record<AdminRole, string[]> = {
  [AdminRole.SUPER_ADMIN]: [
    'merchants:read',
    'merchants:write',
    'merchants:kyc:review',
    'analytics:read',
    'analytics:revenue',
    'config:read',
    'config:write',
    'admin:queues',
  ],
  [AdminRole.FINANCE_ADMIN]: ['analytics:read', 'analytics:revenue'],
  [AdminRole.OPERATIONS_ADMIN]: [
    'merchants:read',
    'merchants:write',
    'merchants:kyc:review',
    'analytics:read',
    'config:read',
  ],
  [AdminRole.SUPPORT_ADMIN]: [
    'merchants:read',
    'merchants:kyc:review',
    'analytics:read',
    'config:read',
  ],
  [AdminRole.READONLY_ADMIN]: ['merchants:read', 'analytics:read', 'config:read'],
};

@Entity('admin_users')
export class AdminUser extends BaseEntity {
  @Column({ unique: true, length: 255 })
  email: string;

  @Column({ select: false })
  passwordHash: string;

  @Column({ length: 100 })
  firstName: string;

  @Column({ length: 100 })
  lastName: string;

  @Column({ type: 'enum', enum: AdminRole, default: AdminRole.READONLY_ADMIN })
  role: AdminRole;

  @Column({ type: 'enum', enum: AdminStatus, default: AdminStatus.ACTIVE })
  status: AdminStatus;

  @Column({ type: 'boolean', default: false })
  twoFactorEnabled: boolean;

  @Column({ nullable: true, select: false })
  twoFactorSecret: string | null;

  @Column({ type: 'int', default: 0 })
  failedLoginAttempts: number;

  @Column({ type: 'timestamptz', nullable: true })
  lockedUntil: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  lastLoginAt: Date | null;

  @Column({ nullable: true })
  lastLoginIp: string | null;

  @Column({ nullable: true })
  createdById: string | null;

  @ManyToOne(() => AdminUser, { nullable: true })
  @JoinColumn({ name: 'createdById' })
  createdBy: AdminUser | null;
}
