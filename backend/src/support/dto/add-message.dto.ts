import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AddMessageDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  message!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  attachmentKey?: string;
}

