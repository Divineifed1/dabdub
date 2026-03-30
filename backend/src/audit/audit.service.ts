import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  And,
  LessThanOrEqual,
  Like,
  MoreThanOrEqual,
  Repository,
} from 'typeorm';
import { AuditLog, ActorType } from './entities/audit-log.entity';
import type { CreateAuditLogDto } from './dto/create-audit-log.dto';
import type { QueryAuditLogDto } from './dto/query-audit-log.dto';

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLog)
    private readonly repo: Repository<AuditLog>,
  ) {}

  async log(dto: CreateAuditLogDto): Promise<AuditLog>;
  async log(
    actorId: string,
    action: string,
    detail: string,
    ipAddress?: string,
  ): Promise<AuditLog>;
  async log(
    input: CreateAuditLogDto | string,
    action?: string,
    detail?: string,
    ipAddress?: string,
  ): Promise<AuditLog> {
    const dto =
      typeof input === 'string'
        ? {
            actorId: input,
            actorType: ActorType.ADMIN,
            action: action!,
            resourceType: 'legacy',
            resourceId: 'legacy',
            after: { detail: detail ?? null },
            ipAddress: ipAddress ?? null,
          }
        : input;

    const entry = this.repo.create({
      actorId: dto.actorId,
      actorType: dto.actorType,
      action: dto.action,
      resourceType: dto.resourceType,
      resourceId: dto.resourceId,
      before: dto.before ?? null,
      after: dto.after ?? null,
      ipAddress: dto.ipAddress ?? null,
      userAgent: dto.userAgent ?? null,
      correlationId: dto.correlationId ?? null,
    });

    return this.repo.save(entry);
  }

  async findById(id: string): Promise<AuditLog> {
    const log = await this.repo.findOne({ where: { id } });
    if (!log) {
      throw new NotFoundException(`AuditLog ${id} not found`);
    }
    return log;
  }

  async findAll(
    query: QueryAuditLogDto,
  ): Promise<{ data: AuditLog[]; total: number; page: number; limit: number }> {
    const {
      page = 1,
      limit = 20,
      actorId,
      actorType,
      resourceType,
      action,
      dateFrom,
      dateTo,
    } = query;

    const where: Record<string, unknown> = {};
    if (actorId) where['actorId'] = actorId;
    if (actorType) where['actorType'] = actorType;
    if (resourceType) where['resourceType'] = resourceType;
    if (action) where['action'] = Like(`${action}%`);

    const dateConditions: Array<ReturnType<typeof MoreThanOrEqual>> = [];
    if (dateFrom) {
      dateConditions.push(MoreThanOrEqual(new Date(dateFrom)) as any);
    }
    if (dateTo) {
      dateConditions.push(LessThanOrEqual(new Date(dateTo)) as any);
    }

    if (dateConditions.length === 2) {
      where['createdAt'] = And(...dateConditions);
    } else if (dateConditions.length === 1) {
      where['createdAt'] = dateConditions[0];
    }

    const [data, total] = await this.repo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      take: limit,
      skip: (page - 1) * limit,
    });

    return { data, total, page, limit };
  }
}
