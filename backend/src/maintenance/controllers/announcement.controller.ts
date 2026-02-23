import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards } from '@nestjs/common';
import { AnnouncementService } from '../services/announcement.service';
import { CreateAnnouncementDto, UpdateAnnouncementDto } from '../dto/announcement.dto';
import { AnnouncementType, AnnouncementAudience } from '../enums/maintenance.enums';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../../auth/guards/permission.guard';
import { Permissions } from '../../auth/decorators/permissions.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';

@Controller('api/v1/announcements')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class AnnouncementController {
  constructor(private readonly announcementService: AnnouncementService) {}

  @Get()
  @Permissions('config:read')
  async listAnnouncements(
    @Query('type') type?: AnnouncementType,
    @Query('isPublished') isPublished?: string,
    @Query('audience') audience?: AnnouncementAudience,
  ) {
    return this.announcementService.listAnnouncements(
      type,
      isPublished ? isPublished === 'true' : undefined,
      audience,
    );
  }

  @Post()
  @Permissions('config:write')
  async createAnnouncement(
    @Body() dto: CreateAnnouncementDto,
    @CurrentUser() user: any,
  ) {
    return this.announcementService.createAnnouncement(dto, user.id);
  }

  @Get(':id')
  @Permissions('config:read')
  async getAnnouncement(@Param('id') id: string) {
    return this.announcementService.getAnnouncementById(id);
  }

  @Patch(':id')
  @Permissions('config:write')
  async updateAnnouncement(
    @Param('id') id: string,
    @Body() dto: UpdateAnnouncementDto,
    @CurrentUser() user: any,
  ) {
    return this.announcementService.updateAnnouncement(id, dto, user.id);
  }

  @Post(':id/publish')
  @Permissions('config:write')
  async publishAnnouncement(@Param('id') id: string, @CurrentUser() user: any) {
    return this.announcementService.publishAnnouncement(id, user.id);
  }

  @Post(':id/unpublish')
  @Permissions('config:write')
  async unpublishAnnouncement(@Param('id') id: string, @CurrentUser() user: any) {
    return this.announcementService.unpublishAnnouncement(id, user.id);
  }

  @Get(':id/recipients')
  @Permissions('config:read')
  async previewRecipients(@Param('id') id: string) {
    return this.announcementService.previewRecipients(id);
  }
}
