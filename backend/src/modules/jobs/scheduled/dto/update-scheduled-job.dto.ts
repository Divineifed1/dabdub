import { IsOptional, IsBoolean, IsString } from 'class-validator';

export class UpdateScheduledJobDto {
    @IsOptional()
    @IsBoolean()
    isEnabled?: boolean;

    @IsOptional()
    @IsString()
    cronExpression?: string;
}
