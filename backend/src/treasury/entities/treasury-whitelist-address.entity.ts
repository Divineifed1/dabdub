import { Entity, Column } from 'typeorm';
import { BaseEntity } from '../../database/entities/base.entity';

@Entity('treasury_whitelist_addresses')
export class TreasuryWhitelistAddress extends BaseEntity {
  @Column()
  address: string;

  @Column()
  label: string;

  @Column({ type: 'jsonb', default: [] })
  allowedChains: string[];

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column()
  addedById: string;

  @Column({ nullable: true })
  removedById: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  removedAt: Date | null;
}
