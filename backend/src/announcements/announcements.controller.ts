import { Controller, Get, Param, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { AnnouncementsService } from './announcements.service';
import { Announcement } from './entities/announcement.entity';

interface RequestWithUser extends Request {
  user?: { id: string };
}

@ApiTags('announcements')
@ApiBearerAuth()
@Controller({ path: 'announcements', version: '1' })
export class AnnouncementsController {
  constructor(private readonly announcementsService: AnnouncementsService) {}

  @Get()
  @ApiOperation({ summary: 'Get active announcements for the current user' })
  getActiveForCurrentUser(
    @Req() req: RequestWithUser,
  ): Promise<Announcement[]> {
    return this.announcementsService.getActiveForUser(req.user!.id);
  }

  @Post(':id/dismiss')
  @ApiOperation({ summary: 'Dismiss an active announcement' })
  async dismiss(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
  ): Promise<void> {
    await this.announcementsService.dismiss(req.user!.id, id);
  }
}
