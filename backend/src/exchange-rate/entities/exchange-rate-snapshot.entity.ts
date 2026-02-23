import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { RateSource } from './enums/rate-source.enum';

@Entity('exchange_rates')
@Index('idx_exchange_rates_pair_timestamp', [
  'cryptoCurrency',
  'fiatCurrency',
  'createdAt',
])
@Index('idx_exchange_rates_source_pair', [
  'source',
  'cryptoCurrency',
  'fiatCurrency',
])
export class ExchangeRate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** e.g. "BTC", "ETH", "USDC" */
  @Column({ length: 20 })
  cryptoCurrency: string;

  /** e.g. "USD", "EUR", "NGN" */
  @Column({ length: 10 })
  fiatCurrency: string;

  /** Mid-market rate */
  @Column('decimal', { precision: 24, scale: 10 })
  rate: number;

  /** Best bid (buy) price from source */
  @Column('decimal', { precision: 24, scale: 10, nullable: true })
  bid: number | null;

  /** Best ask (sell) price from source */
  @Column('decimal', { precision: 24, scale: 10, nullable: true })
  ask: number | null;

  /** Percentage spread between bid and ask */
  @Column('decimal', { precision: 10, scale: 4, nullable: true })
  spreadPercent: number | null;

  /** Which provider produced this row */
  @Column({ type: 'enum', enum: RateSource })
  source: RateSource;

  /**
   * Confidence score 0–1.
   * 1 = all providers agreed, low spread.
   * Only meaningful for AGGREGATED rows.
   */
  @Column('decimal', { precision: 5, scale: 4, nullable: true })
  confidenceScore: number | null;

  /** Raw per-provider breakdown (AGGREGATED rows only) */
  @Column('jsonb', { nullable: true })
  providerBreakdown: Record | null;

  /** Rate expires / becomes stale after this timestamp */
  @Column({ type: 'timestamptz', nullable: true })
  validUntil: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  /** Convenience: is this rate past its validUntil? */
  isStale(): boolean {
    if (!this.validUntil) return false;
    return new Date() > this.validUntil;
  }
}
