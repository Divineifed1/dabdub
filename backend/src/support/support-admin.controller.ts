import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  Query,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { AdminRole } from '../admin/entities/admin.entity';
import { SupportService } from './support.service';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { AdminTicketQueryDto } from './dto/admin-ticket-query.dto';

@ApiTags('admin-support')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(AdminRole.ADMIN, AdminRole.SUPERADMIN)
@Controller('admin/support/tickets')
export class SupportAdminController {
  constructor(private readonly supportService: SupportService) {}

  @Get()
  @ApiOperation({ summary: 'List all tickets (admin dashboard)' })
  async listAllTickets(@Query() query: AdminTicketQueryDto) {
    return this.supportService.listAllTickets(query);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update ticket status/priority/assignment' })
  async updateTicket(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTicketDto,
  ) {
    return this.supportService.updateTicket(id, dto);
  }
}

