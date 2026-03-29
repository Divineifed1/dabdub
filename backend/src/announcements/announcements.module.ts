import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/entities/user.entity';
import { WsModule } from '../ws/ws.module';
import { AdminAnnouncementsController } from './admin-announcements.controller';
import { AnnouncementsController } from './announcements.controller';
import { AnnouncementsService } from './announcements.service';
import { AnnouncementDismissal } from './entities/announcement-dismissal.entity';
import { Announcement } from './entities/announcement.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Announcement, AnnouncementDismissal, User]),
    WsModule,
  ],
  providers: [AnnouncementsService],
  controllers: [AnnouncementsController, AdminAnnouncementsController],
  exports: [AnnouncementsService],
})
export class AnnouncementsModule {}
