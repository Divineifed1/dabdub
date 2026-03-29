import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { TicketStatus, TicketPriority, TicketCategory } from '../entities/support-ticket.entity';

export class AdminTicketQueryDto {
  @ApiPropertyOptional({ enum: TicketStatus })
  @IsOptional()
  @IsEnum(TicketStatus)
  status?: TicketStatus;

  @ApiPropertyOptional({ enum: TicketPriority })
  @IsOptional()
  @IsEnum(TicketPriority)
  priority?: TicketPriority;

  @ApiPropertyOptional({ enum: TicketCategory })
  @IsOptional()
  @IsEnum(TicketCategory)
  category?: TicketCategory;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  assignedTo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  limit?: number = 20;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cursor?: string;
}

