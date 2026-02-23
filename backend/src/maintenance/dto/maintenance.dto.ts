import { IsString, IsEnum, IsDateString, IsArray, IsBoolean, MinLength } from 'class-validator';
import { MaintenanceType } from '../enums/maintenance.enums';

export class ScheduleMaintenanceDto {
  @IsString()
  title: string;

  @IsString()
  @MinLength(20)
  description: string;

  @IsEnum(MaintenanceType)
  type: MaintenanceType;

  @IsDateString()
  scheduledStartAt: string;

  @IsDateString()
  scheduledEndAt: string;

  @IsArray()
  affectedServices: string[];

  @IsBoolean()
  notifyMerchants: boolean;

  @IsBoolean()
  blockNewTransactions: boolean;

  @IsBoolean()
  pauseSettlements: boolean;
}

export class CancelMaintenanceDto {
  @IsString()
  @MinLength(10)
  reason: string;
}
