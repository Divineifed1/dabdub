import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Req,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { User } from '../users/entities/user.entity';
import { TransfersService } from './transfers.service';
import { CreateTransferDto } from './dto/create-transfer.dto';
import {
  P2pLimitsResponseDto,
  PreviewTransferDto,
  PreviewTransferResponseDto,
} from './dto/preview-transfer.dto';
import { TransferQueryDto } from './dto/transfer-query.dto';
import { Transfer } from './entities/transfer.entity';
import { RequirePin } from '../pin/decorators/require-pin.decorator';
import { PinGuard } from '../pin/guards/pin.guard';

type AuthenticatedRequest = Request & { user: User };

@ApiTags('transfers')
@ApiBearerAuth()
@Controller({ path: 'transfers', version: '1' })
export class TransfersController {
  constructor(private readonly transfersService: TransfersService) {}

  @Post('preview')
  @ApiOperation({ summary: 'Preview a transfer, including P2P confirmation requirements' })
  @ApiResponse({ status: 200, type: PreviewTransferResponseDto })
  async preview(
    @Req() req: AuthenticatedRequest,
    @Body() dto: PreviewTransferDto,
  ): Promise<PreviewTransferResponseDto> {
    return this.transfersService.preview(req.user.id, req.user.username, dto);
  }

  @Post()
  @RequirePin()
  @UseGuards(PinGuard)
  @ApiHeader({ name: 'X-Transaction-Pin', description: '4-digit PIN', required: true })
  @ApiOperation({ summary: 'Send USDC to another user by @username' })
  @ApiResponse({ status: 201, type: Transfer })
  async create(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateTransferDto,
  ): Promise<Transfer> {
    return this.transfersService.create(req.user.id, req.user.username, dto);
  }

  @Get('p2p-limits')
  @ApiOperation({ summary: 'Get remaining P2P transfer limits' })
  @ApiResponse({ status: 200, type: P2pLimitsResponseDto })
  async getP2pLimits(
    @Req() req: AuthenticatedRequest,
  ): Promise<P2pLimitsResponseDto> {
    return this.transfersService.getP2pLimits(req.user.id);
  }

  @Get()
  @ApiOperation({ summary: 'List transfers (cursor-paginated)' })
  async findAll(
    @Req() req: AuthenticatedRequest,
    @Query() query: TransferQueryDto,
  ): Promise<{ data: Transfer[]; nextCursor: string | null }> {
    return this.transfersService.findAll(req.user.id, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single transfer' })
  @ApiResponse({ status: 200, type: Transfer })
  async findOne(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ): Promise<Transfer> {
    return this.transfersService.findOne(req.user.id, id);
  }
}
