import { PartialType } from '@nestjs/swagger';
import { CreateAdminAccessLogDto } from './create-admin-access-log.dto';

export class UpdateAdminAccessLogDto extends PartialType(CreateAdminAccessLogDto) {}
