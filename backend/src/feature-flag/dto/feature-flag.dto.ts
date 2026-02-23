import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
  MinLength,
  ValidateIf,
  IsArray,
} from 'class-validator';
import { Type } from 'class-transformer';
import { MerchantTier } from '../../merchant/dto/merchant.dto';
import { RolloutStrategy } from '../enums/feature-flag.enums';

export class CreateFeatureFlagDto {
  @IsString()
  @Matches(/^[a-z_]+$/, {
    message: 'flagKey must contain only lowercase letters and underscores',
  })
  flagKey: string;

  @IsString()
  @IsNotEmpty()
  displayName: string;

  @IsString()
  @MinLength(20)
  description: string;

  @IsEnum(RolloutStrategy)
  rolloutStrategy: RolloutStrategy;

  @IsBoolean()
  isEnabled: boolean;

  @IsBoolean()
  isKillSwitch: boolean;

  // ── Strategy-specific fields (conditionally required) ──────────────────────

  @ValidateIf((o) => o.rolloutStrategy === RolloutStrategy.PERCENTAGE)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  rolloutPercentage?: number;

  @ValidateIf((o) => o.rolloutStrategy === RolloutStrategy.MERCHANT_IDS)
  @IsArray()
  @IsUUID('4', { each: true })
  targetMerchantIds?: string[];

  @ValidateIf((o) => o.rolloutStrategy === RolloutStrategy.MERCHANT_TIERS)
  @IsArray()
  @IsEnum(MerchantTier, { each: true })
  targetTiers?: MerchantTier[];

  @ValidateIf((o) => o.rolloutStrategy === RolloutStrategy.COUNTRIES)
  @IsArray()
  @IsString({ each: true })
  targetCountries?: string[];
}

export class UpdateFeatureFlagDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  displayName?: string;

  @IsOptional()
  @IsString()
  @MinLength(20)
  description?: string;

  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  @IsOptional()
  @IsEnum(RolloutStrategy)
  rolloutStrategy?: RolloutStrategy;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  rolloutPercentage?: number;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  targetMerchantIds?: string[];

  @IsOptional()
  @IsArray()
  @IsEnum(MerchantTier, { each: true })
  targetTiers?: MerchantTier[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  targetCountries?: string[];
}

export class SetFlagOverrideDto {
  @IsUUID()
  merchantId: string;

  @IsBoolean()
  enabled: boolean;

  @IsString()
  @MinLength(10)
  reason: string;
}

export class FlagEvaluationResponseDto {
  flagKey: string;
  merchantId: string;
  isEnabled: boolean;
  reason: string;
  detail: string;
}

export class MerchantFlagsResponseDto {
  merchantId: string;
  evaluations: FlagEvaluationResponseDto[];
}
