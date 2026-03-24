import { IsEnum, IsOptional, IsString } from 'class-validator';
import { FraudStatus } from '../entities/fraud-flag.entity';

const RESOLVABLE = [FraudStatus.RESOLVED, FraudStatus.FALSE_POSITIVE] as const;
type ResolvableStatus = (typeof RESOLVABLE)[number];

export class ResolveFlagDto {
  @IsEnum(RESOLVABLE)
  resolution!: ResolvableStatus;

  @IsOptional()
  @IsString()
  note?: string;
}
