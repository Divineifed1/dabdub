import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { TicketCategory } from '../entities/support-ticket.entity';

export class CreateTicketDto {
  @ApiProperty({ enum: TicketCategory })
  @IsEnum(TicketCategory)
  category!: TicketCategory;

  @ApiProperty()
  @IsString()
  @MaxLength(100)
  @IsNotEmpty()
  subject!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  description!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  transactionId?: string;
}

