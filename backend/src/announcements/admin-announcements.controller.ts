import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { AdminRole } from '../admin/entities/admin.entity';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { AnnouncementsService } from './announcements.service';
import { AnnouncementWithStatsDto } from './dto/announcement-with-stats.dto';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { UpdateAnnouncementDto } from './dto/update-announcement.dto';
import { Announcement } from './entities/announcement.entity';

interface RequestWithUser extends Request {
  user?: { id: string };
}

@ApiTags('admin.announcements')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller({ path: 'admin/announcements', version: '1' })
export class AdminAnnouncementsController {
  constructor(private readonly announcementsService: AnnouncementsService) {}

  @Post()
  @Roles(AdminRole.ADMIN, AdminRole.SUPERADMIN)
  @ApiOperation({ summary: 'Create an announcement' })
  create(
    @Req() req: RequestWithUser,
    @Body() dto: CreateAnnouncementDto,
  ): Promise<Announcement> {
    return this.announcementsService.create(req.user!.id, dto);
  }

  @Get()
  @Roles(AdminRole.ADMIN, AdminRole.SUPERADMIN)
  @ApiOperation({ summary: 'List announcements with dismissal counts' })
  getAll(): Promise<AnnouncementWithStatsDto[]> {
    return this.announcementsService.getAllWithStats();
  }

  @Patch(':id')
  @Roles(AdminRole.ADMIN, AdminRole.SUPERADMIN)
  @ApiOperation({ summary: 'Update an announcement' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateAnnouncementDto,
  ): Promise<Announcement> {
    return this.announcementsService.update(id, dto);
  }

  @Delete(':id')
  @Roles(AdminRole.ADMIN, AdminRole.SUPERADMIN)
  @ApiOperation({ summary: 'Deactivate an announcement' })
  deactivate(@Param('id') id: string): Promise<Announcement> {
    return this.announcementsService.deactivate(id);
  }
}
