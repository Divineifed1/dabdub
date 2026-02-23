import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { MaintenanceWindow } from './entities/maintenance-window.entity';
import { SystemAnnouncement } from './entities/system-announcement.entity';
import { MaintenanceService } from './services/maintenance.service';
import { AnnouncementService } from './services/announcement.service';
import { MaintenanceController } from './controllers/maintenance.controller';
import { AnnouncementController } from './controllers/announcement.controller';
import { MaintenanceProcessor } from './processors/maintenance.processor';
import { AnnouncementProcessor } from './processors/announcement.processor';
import { AuditModule } from '../audit/audit.module';
import { GlobalConfigModule } from '../config/config.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([MaintenanceWindow, SystemAnnouncement]),
    BullModule.registerQueue({ name: 'maintenance' }, { name: 'announcements' }),
    AuditModule,
    GlobalConfigModule,
  ],
  controllers: [MaintenanceController, AnnouncementController],
  providers: [MaintenanceService, AnnouncementService, MaintenanceProcessor, AnnouncementProcessor],
  exports: [MaintenanceService, AnnouncementService],
})
export class MaintenanceModule {}
