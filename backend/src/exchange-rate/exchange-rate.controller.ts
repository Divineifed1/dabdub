import {
  Controller,
  Get,
  Query,
  ParseEnumPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { ExchangeRateService } from './exchange-rate.service';
import { RateSource } from './enums/rate-source.enum';

@Controller('exchange-rates')
export class ExchangeRateController {
  constructor(private readonly service: ExchangeRateService) {}

  @Get()
  async getCurrentRate(
    @Query('crypto') crypto: string,
    @Query('fiat') fiat: string,
  ) {
    const rate = await this.service.getRate(
      crypto.toUpperCase(),
      fiat.toUpperCase(),
    );
    return { crypto, fiat, rate };
  }

  @Get('history')
  async getHistory(
    @Query('crypto') crypto: string,
    @Query('fiat') fiat: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query(
      'source',
      new DefaultValuePipe(RateSource.AGGREGATED),
      new ParseEnumPipe(RateSource),
    )
    source: RateSource,
  ) {
    return this.service.getHistoricalRates(
      crypto.toUpperCase(),
      fiat.toUpperCase(),
      new Date(from),
      new Date(to),
      source,
    );
  }
}
