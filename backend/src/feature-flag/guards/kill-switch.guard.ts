import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserRole } from '../../database/entities/user.entity';
import { FeatureFlag } from '../entities/feature-flag.entity';

/**
 * Prevents non-SUPER_ADMIN users from modifying kill-switch flags.
 * Must be applied AFTER AdminJwtGuard so request.user is populated.
 * The :flagKey param must be present in the route.
 */
@Injectable()
export class KillSwitchGuard implements CanActivate {
  constructor(
    @InjectRepository(FeatureFlag)
    private readonly flagRepo: Repository<FeatureFlag>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const flagKey: string | undefined = request.params?.flagKey;

    if (!flagKey) return true; // no flagKey param, let the handler decide

    const flag = await this.flagRepo.findOne({ where: { flagKey } });
    if (!flag) return true; // 404 will be thrown by the service

    if (flag.isKillSwitch && user?.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException(
        'Only SUPER_ADMIN can modify kill-switch feature flags',
      );
    }

    return true;
  }
}
