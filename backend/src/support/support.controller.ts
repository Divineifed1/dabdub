import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SupportService } from './support.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { AddMessageDto } from './dto/add-message.dto';
import { TicketResponseDto } from './dto/ticket-response.dto';
import { AdminTicketQueryDto } from './dto/admin-ticket-query.dto';
import { AuditInterceptor } from '../audit/audit.interceptor';

@ApiTags('support')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@UseInterceptors(AuditInterceptor)
@Controller('support/tickets')
export class SupportController {
  constructor(private readonly supportService: SupportService) {}

  @Post()
  @ApiOperation({ summary: 'Create new support ticket' })
  @ApiResponse({ status: 201, type: TicketResponseDto })
  async createTicket(
    @Body() dto: CreateTicketDto,
    @CurrentUser('id') userId: string,
  ): Promise<TicketResponseDto> {
    return this.supportService.createTicket(userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List user tickets (paginated)' })
  async listMyTickets(
    @Query() query: { limit?: number; cursor?: string },
    @CurrentUser('id') userId: string,
  ) {
    return this.supportService.listUserTickets(userId, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get ticket details with messages' })
  @ApiParam({ name: 'id' })
  async getTicket(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
  ): Promise<TicketResponseDto> {
    return this.supportService.getUserTicket(userId, id);
  }

  @Post(':id/messages')
  @ApiOperation({ summary: 'Add message to ticket' })
  @ApiParam({ name: 'id' })
  async addMessage(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddMessageDto,
    @CurrentUser('id') userId: string,
  ): Promise<TicketResponseDto> {
    return this.supportService.addMessage(userId, id, dto);
  }
}

