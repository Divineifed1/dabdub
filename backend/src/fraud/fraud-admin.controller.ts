import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { FraudService, AuditLogPort, UserFreezePort } from './fraud.service';
import { QueryFlagsDto } from './dto/query-flags.dto';
import { ResolveFlagDto } from './dto/resolve-flag.dto';
import { FraudFlag } from './entities/fraud-flag.entity';
import { Logger } from '@nestjs/common';

/** Stub ports — replace with real injected services when available */
class StubUserFreezePort implements UserFreezePort {
  async freezeUser(_userId: string): Promise<void> {}
  async unfreezeUser(_userId: string): Promise<void> {}
}

class StubAuditLogPort implements AuditLogPort {
  private readonly logger = new Logger('AuditLog');
  async log(adminId: string, action: string, detail: string): Promise<void> {
    this.logger.log(
      `[AUDIT] adminId=${adminId} action=${action} detail=${detail}`,
    );
  }
}

@Controller('admin/fraud')
export class FraudAdminController {
  constructor(private readonly fraudService: FraudService) {}

  /**
   * GET /admin/fraud/flags?severity=high&status=open&userId=xxx&page=1&limit=20
   */
  @Get('flags')
  async listFlags(
    @Query() query: QueryFlagsDto,
  ): Promise<{
    data: FraudFlag[];
    total: number;
    page: number;
    limit: number;
  }> {
    return this.fraudService.findFlags(query);
  }

  /**
   * PATCH /admin/fraud/flags/:id/resolve
   * Body: { resolution: 'resolved' | 'false_positive', note?: string }
   */
  @Patch('flags/:id/resolve')
  async resolveFlag(
    @Param('id') id: string,
    @Body() dto: ResolveFlagDto,
    @Req() req: Request,
  ): Promise<FraudFlag> {
    const adminId: string = (req as any).user?.id ?? 'system';

    return this.fraudService.resolveFlag(id, adminId, dto, {
      userFreeze: new StubUserFreezePort(),
      auditLog: new StubAuditLogPort(),
    });
  }
}
