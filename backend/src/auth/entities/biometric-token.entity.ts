import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';

@Entity('biometric_tokens')
@Index(['userId', 'deviceId'])
@Index(['tokenHash'], { unique: true })
@Index(['userId', 'isRevoked'])
export class BiometricToken extends BaseEntity {
  @Column({ name: 'user_id' })
  userId!: string;

  @Column({ name: 'device_id' })
  deviceId!: string;

  @Column({ name: 'token_hash', length: 64 })
  tokenHash!: string;

  @Column({
    name: 'last_used_at',
    type: 'timestamptz',
    nullable: true,
    default: null,
  })
  lastUsedAt!: Date | null;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ name: 'is_revoked', default: false })
  isRevoked!: boolean;
}
