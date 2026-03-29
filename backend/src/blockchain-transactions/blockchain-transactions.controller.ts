import { Controller, Get, Param, ParseUUIDPipe, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BlockchainTransactionsService } from './blockchain-transactions.service';
import { QueryBlockchainTransactionDto } from './dto/query-blockchain-transaction.dto';

@UseGuards(JwtAuthGuard)
@Controller({ path: 'blockchain/transactions', version: '1' })
export class BlockchainTransactionsController {
  constructor(
    private readonly blockchainTransactionsService: BlockchainTransactionsService,
  ) {}

  @Get()
  async getTransactions(
    @Req() req: { user: { id: string } },
    @Query() query: QueryBlockchainTransactionDto,
  ) {
    return this.blockchainTransactionsService.findByUserId(req.user.id, query);
  }

  @Get(':id')
  async getTransaction(
    @Req() req: { user: { id: string } },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.blockchainTransactionsService.findOneForUser(id, req.user.id);
  }
}
