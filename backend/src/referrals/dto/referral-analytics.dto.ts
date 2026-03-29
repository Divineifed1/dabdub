import { ApiProperty } from '@nestjs/swagger';

export interface FunnelStats {
  totalReferralLinks: number;
  clicked: number;
  signedUp: number;
  converted: number;
  rewarded: number;
  conversionRate: number; // percent
  avgDaysToConvert: number;
}

export class FunnelStatsDto implements FunnelStats {
  @ApiProperty({ example: 1000 })
  totalReferralLinks!: number;

  @ApiProperty({ example: 500 })
  clicked!: number;

  @ApiProperty({ example: 200 })
  signedUp!: number;

  @ApiProperty({ example: 50 })
  converted!: number;

  @ApiProperty({ example: 30 })
  rewarded!: number;

  @ApiProperty({ example: 5.0 })
  conversionRate!: number;

  @ApiProperty({ example: 3.2 })
  avgDaysToConvert!: number;
}

export interface TopReferrer {
  username: string;
  totalReferred: number;
  totalConverted: number;
  totalEarnedUsdc: string;
}

export class TopReferrersDto {
  @ApiProperty({ type: [Object] })
  referrers!: TopReferrer[];
}

export interface CohortMetric {
  referred: number;
  organic: number;
  referredPercent: number;
  organicPercent: number;
}

export class CohortComparisonDto {
  @ApiProperty({ example: 75.0 })
  d7Retention: CohortMetric;

  @ApiProperty({ example: 25.0 })
  avgFirstTxAmount: CohortMetric;

  @ApiProperty({ example: 150.0 })
  d30TxVolume: CohortMetric;

  @ApiProperty({ example: 10.0 })
  churnRate: CohortMetric;
}

export class RewardSpendDto {
  @ApiProperty({ type: [Object] })
  weeklySpend!: Array<{ week: string; amount: string }>;

  @ApiProperty({ example: '120.00' })
  projectedMonthly: string;
}

export class UserReferralStatsDto {
  @ApiProperty({ type: [Object] })
  referrals!: Array<{
    id: string;
    referredUsername: string;
    status: string;
    convertedAt: string | null;
    rewardedAt: string | null;
  }>;
}

