import { Controller, Get, Post, Param, Body } from '@nestjs/common';
import { ReconciliationService } from './reconciliation.service';

@Controller('reconciliation')
export class ReconciliationController {
  constructor(private readonly reconciliationService: ReconciliationService) {}

  @Get('report')
  async getReport() {
    return this.reconciliationService.getReport();
  }

  @Get('discrepancies')
  async getDiscrepancies() {
    return this.reconciliationService.getDiscrepancies();
  }

  @Post(':id/resolve')
  async manualResolve(
    @Param('id') id: string,
    @Body() body: { resolvedBy: string; notes: string },
  ) {
    return this.reconciliationService.manualResolve(id, body.resolvedBy, body.notes);
  }

  @Post('run')
  async runManual() {
    await this.reconciliationService.runAutoReconciliation();
    return { message: 'Reconciliation triggered successfully' };
  }
}
