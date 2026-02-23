import { Injectable, Logger, Inject } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { ExchangeRate } from './exchange-rate.entity';
import { RateSource } from './enums/rate-source.enum';
import { CoinbaseProvider } from './providers/coinbase.provider';
import { BinanceProvider } from './providers/binance.provider';
import { CoinGeckoProvider } from './providers/coingecko.provider';
import { RateProvider } from './interfaces/rate-provider.interface';

const CACHE_TTL_MS = 60_000; // 60 s
const VALID_UNTIL_OFFSET_MS = 90_000; // 90 s – slightly longer than TTL
const STALENESS_THRESHOLD_MS = 2 * 60 * 1000;

@Injectable()
export class ExchangeRateService {
  private readonly logger = new Logger(ExchangeRateService.name);

  private readonly monitoredPairs = [
    { crypto: 'BTC', fiat: 'USD' },
    { crypto: 'ETH', fiat: 'USD' },
  ];

  private readonly providerWeights: Record = {
    Coinbase: 0.4,
    Binance: 0.4,
    CoinGecko: 0.2,
  };

  private readonly providerSourceMap: Record = {
    Coinbase: RateSource.COINBASE,
    Binance: RateSource.BINANCE,
    CoinGecko: RateSource.COINGECKO,
  };

  private readonly lastSuccessTimestamp = new Map();
  private readonly providers: RateProvider[];

  constructor(
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    @InjectRepository(ExchangeRate)
    private rateRepository: Repository,
    private readonly coinbaseProvider: CoinbaseProvider,
    private readonly binanceProvider: BinanceProvider,
    private readonly coinGeckoProvider: CoinGeckoProvider,
  ) {
    this.providers = [coinbaseProvider, binanceProvider, coinGeckoProvider];
  }

  // ──────────────────────────────────────────────
  // Public API
  // ──────────────────────────────────────────────

  async getRate(cryptoCurrency: string, fiatCurrency: string): Promise {
    const cacheKey = `rate:${cryptoCurrency}-${fiatCurrency}`;
    const cached = await this.cacheManager.get(cacheKey);
    if (cached !== null && cached !== undefined) return cached;
    return this.fetchAndAggregateRate(cryptoCurrency, fiatCurrency);
  }

  async convertAmount(
    amount: number,
    cryptoCurrency: string,
    fiatCurrency: string,
  ): Promise {
    const rate = await this.getRate(cryptoCurrency, fiatCurrency);
    return amount * rate;
  }

  async getHistoricalRates(
    cryptoCurrency: string,
    fiatCurrency: string,
    from: Date,
    to: Date,
    source: RateSource = RateSource.AGGREGATED,
  ): Promise {
    return this.rateRepository.find({
      where: {
        cryptoCurrency,
        fiatCurrency,
        source,
        createdAt: Between(from, to),
      },
      order: { createdAt: 'ASC' },
    });
  }

  // ──────────────────────────────────────────────
  // Scheduled jobs
  // ──────────────────────────────────────────────

  @Cron(CronExpression.EVERY_MINUTE)
  async handleCron(): Promise {
    this.logger.log('Starting scheduled rate update...');
    for (const { crypto, fiat } of this.monitoredPairs) {
      try {
        await this.fetchAndAggregateRate(crypto, fiat);
      } catch (e: any) {
        this.logger.error(
          `Cron update failed for ${crypto}-${fiat}: ${e.message}`,
        );
      }
    }
    this.logger.log('Scheduled rate update completed.');
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async checkStaleness(): Promise {
    const now = Date.now();
    for (const { crypto, fiat } of this.monitoredPairs) {
      const key = `${crypto}-${fiat}`;
      const lastUpdate = this.lastSuccessTimestamp.get(key) ?? 0;
      if (now - lastUpdate > STALENESS_THRESHOLD_MS) {
        this.logger.error(
          `ALERT: Rate for ${key} is STALE! Last update: ${new Date(lastUpdate).toISOString()}`,
        );
      }
    }
  }

  // ──────────────────────────────────────────────
  // Core aggregation
  // ──────────────────────────────────────────────

  async fetchAndAggregateRate(
    cryptoCurrency: string,
    fiatCurrency: string,
  ): Promise {
    const pair = `${cryptoCurrency}-${fiatCurrency}`;
    this.logger.debug(`Fetching rates for ${pair}…`);

    const results = await Promise.allSettled(
      this.providers.map((p) =>
        p.getRate(pair).then((rate) => ({ provider: p.name, rate })),
      ),
    );

    const successfulRates: { provider: string; rate: number }[] = [];
    const errors: string[] = [];

    for (const result of results) {
      if (result.status === 'fulfilled') {
        successfulRates.push(result.value);
      } else {
        errors.push(result.reason.message);
      }
    }

    if (successfulRates.length === 0) {
      return this.fallbackRate(cryptoCurrency, fiatCurrency, pair);
    }

    // Persist individual provider rows
    await this.saveProviderRates(cryptoCurrency, fiatCurrency, successfulRates);

    const validRates = this.filterOutliers(successfulRates);
    const spreadPercent = this.calculateSpread(validRates);
    const aggregated = this.weightedAverage(validRates);
    const confidence = this.calculateConfidence(
      validRates.length,
      this.providers.length,
      spreadPercent,
    );
    const validUntil = new Date(Date.now() + VALID_UNTIL_OFFSET_MS);

    this.logger.log(
      `${pair}: rate=${aggregated} confidence=${confidence.toFixed(2)} spread=${spreadPercent.toFixed(2)}%`,
    );

    const breakdown = Object.fromEntries(
      successfulRates.map((r) => [r.provider, r.rate]),
    );

    await this.rateRepository.save(
      this.rateRepository.create({
        cryptoCurrency,
        fiatCurrency,
        rate: aggregated,
        bid: Math.min(...validRates.map((r) => r.rate)),
        ask: Math.max(...validRates.map((r) => r.rate)),
        spreadPercent,
        source: RateSource.AGGREGATED,
        confidenceScore: confidence,
        providerBreakdown: breakdown,
        validUntil,
      }),
    );

    const cacheKey = `rate:${pair}`;
    await this.cacheManager.set(cacheKey, aggregated, CACHE_TTL_MS);
    this.lastSuccessTimestamp.set(pair, Date.now());

    return aggregated;
  }

  // ──────────────────────────────────────────────
  // Helpers
  // ──────────────────────────────────────────────

  private async saveProviderRates(
    cryptoCurrency: string,
    fiatCurrency: string,
    rates: { provider: string; rate: number }[],
  ): Promise {
    const entities = rates.map(({ provider, rate }) =>
      this.rateRepository.create({
        cryptoCurrency,
        fiatCurrency,
        rate,
        source: this.providerSourceMap[provider] ?? RateSource.AGGREGATED,
        validUntil: new Date(Date.now() + VALID_UNTIL_OFFSET_MS),
      }),
    );
    await this.rateRepository.save(entities);
  }

  private async fallbackRate(
    cryptoCurrency: string,
    fiatCurrency: string,
    pair: string,
  ): Promise {
    this.logger.warn(
      `All providers failed for ${pair}. Attempting DB fallback…`,
    );
    const last = await this.rateRepository.findOne({
      where: { cryptoCurrency, fiatCurrency, source: RateSource.AGGREGATED },
      order: { createdAt: 'DESC' },
    });
    if (last) {
      this.logger.log(
        `Fallback: using DB rate ${last.rate} from ${last.createdAt.toISOString()}`,
      );
      return Number(last.rate);
    }
    throw new Error(
      `No rate available for ${pair} from any source including DB.`,
    );
  }

  private weightedAverage(rates: { provider: string; rate: number }[]): number {
    let weightedSum = 0;
    let totalWeight = 0;
    for (const { provider, rate } of rates) {
      const w = this.providerWeights[provider] ?? 0.1;
      weightedSum += rate * w;
      totalWeight += w;
    }
    return totalWeight > 0 ? weightedSum / totalWeight : 0;
  }

  calculateSpread(rates: { rate: number }[]): number {
    if (rates.length < 2) return 0;
    const prices = rates.map((r) => r.rate);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    return min === 0 ? 0 : ((max - min) / min) * 100;
  }

  calculateConfidence(
    successCount: number,
    totalProviders: number,
    spread: number,
  ): number {
    if (totalProviders === 0) return 0;
    let score = successCount / totalProviders;
    if (spread > 5.0) score *= 0.5;
    else if (spread > 1.0) score *= 0.8;
    return Math.min(Math.max(score, 0), 1);
  }

  private filterOutliers(
    rates: { provider: string; rate: number }[],
  ): { provider: string; rate: number }[] {
    if (rates.length <= 2) return rates;
    const sorted = [...rates].sort((a, b) => a.rate - b.rate);
    const mid = Math.floor(sorted.length / 2);
    const median =
      sorted.length % 2 !== 0
        ? sorted[mid].rate
        : (sorted[mid - 1].rate + sorted[mid].rate) / 2;

    return rates.filter(({ provider, rate }) => {
      const deviation = Math.abs(rate - median) / median;
      if (deviation > 0.05) {
        this.logger.warn(
          `Outlier: ${provider} rate ${rate} deviates ${(deviation * 100).toFixed(2)}% from median`,
        );
        return false;
      }
      return true;
    });
  }
}
