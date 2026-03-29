import { ApiProperty } from '@nestjs/swagger';
import { Announcement } from '../entities/announcement.entity';

export class AnnouncementWithStatsDto extends Announcement {
  @ApiProperty()
  dismissalCount!: number;
}
