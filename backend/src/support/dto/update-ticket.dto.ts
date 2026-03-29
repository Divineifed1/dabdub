import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { TicketStatus, TicketPriority } from '../entities/support-ticket.entity';

export class UpdateTicketDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  assignedTo?: string;

  @ApiPropertyOptional({ enum: TicketStatus })
  @IsOptional()
  @IsEnum(TicketStatus)
  status?: TicketStatus;

  @ApiPropertyOptional({ enum: TicketPriority })
  @IsOptional()
  @IsEnum(TicketPriority)
  priority?: TicketPriority;
}

