import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  Request,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ComplianceService } from '../services/compliance.service';
import { GenerateComplianceReportDto } from '../dto/generate-compliance-report.dto';
import { PaginationQueryDto } from '../dto/pagination-query.dto';

/**
 * Placeholder guard — replace with your project's AuthGuard + permission check.
 * Required permission: audit:read
 */
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RequirePermissions } from '../../auth/decorators/require-permissions.decorator';

@ApiTags('Compliance Reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@RequirePermissions('audit:read')
@Controller('api/v1/compliance/reports')
export class ComplianceController {
  constructor(private readonly complianceService: ComplianceService) {}

  // ---------------------------------------------------------------------------
  // POST /api/v1/compliance/reports/generate
  // ---------------------------------------------------------------------------

  @Post('generate')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Queue compliance report generation' })
  @ApiResponse({
    status: 202,
    description: 'Report queued successfully',
    schema: {
      example: {
        reportId: '550e8400-e29b-41d4-a716-446655440000',
        status: 'QUEUED',
        estimatedRows: 45230,
        message: 'Report queued. You will be notified by email when ready.',
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid date range or parameters' })
  async generateReport(
    @Body() dto: GenerateComplianceReportDto,
    @Request() req: { user: { id: string; email: string } },
  ) {
    return this.complianceService.queueReport(dto, req.user);
  }

  // ---------------------------------------------------------------------------
  // GET /api/v1/compliance/reports
  // ---------------------------------------------------------------------------

  @Get()
  @ApiOperation({ summary: 'List generated compliance reports (paginated)' })
  @ApiResponse({ status: 200, description: 'Paginated list of compliance reports' })
  async listReports(@Query() query: PaginationQueryDto) {
    return this.complianceService.listReports(query);
  }

  // ---------------------------------------------------------------------------
  // GET /api/v1/compliance/reports/:id
  // ---------------------------------------------------------------------------

  @Get(':id')
  @ApiOperation({ summary: 'Get report status and download link' })
  @ApiResponse({
    status: 200,
    description: 'Report detail with pre-signed download URL (if completed)',
    schema: {
      example: {
        id: '550e8400-e29b-41d4-a716-446655440000',
        reportType: 'TRANSACTION_REPORT',
        status: 'COMPLETED',
        format: 'CSV',
        startDate: '2026-01-01',
        endDate: '2026-01-31',
        rowCount: 12840,
        fileSizeBytes: 2340000,
        generatedAt: '2026-02-19T10:05:00Z',
        expiresAt: '2026-02-26T10:05:00Z',
        downloadUrl: 'https://s3.amazonaws.com/presigned-url-...',
        requestedBy: {
          id: '550e8400-e29b-41d4-a716-446655440001',
          email: 'compliance@cheese.io',
        },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Report not found' })
  async getReport(@Param('id', ParseUUIDPipe) id: string) {
    return this.complianceService.getReport(id);
  }
}
