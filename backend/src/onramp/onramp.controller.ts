import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { InitiateDto } from './dto/initiate.dto';
import { InitiateResponseDto } from './dto/initiate-response.dto';
import { PaginateOrdersDto } from './dto/paginate-orders.dto';
import { PreviewDto, PreviewResponseDto } from './dto/preview.dto';
import { OnRampOrder } from './onramp-order.entity';
import { OnRampService } from './onramp.service';

type AuthenticatedRequest = Request & { user: { id: string } };

@ApiTags('onramp')
@ApiBearerAuth()
@Controller('onramp')
export class OnRampController {
  constructor(private readonly onRampService: OnRampService) {}

  @Post('preview')
  @ApiOkResponse({ type: PreviewResponseDto })
  preview(
    @Req() req: AuthenticatedRequest,
    @Body() dto: PreviewDto,
  ): Promise<PreviewResponseDto> {
    return this.onRampService.preview(req.user.id, dto.amountNgn);
  }

  @Post('initiate')
  @ApiOkResponse({ type: InitiateResponseDto })
  initiate(
    @Req() req: AuthenticatedRequest,
    @Body() dto: InitiateDto,
  ): Promise<InitiateResponseDto> {
    return this.onRampService.initiate(req.user.id, dto.amountNgn);
  }

  @Get('orders')
  getOrders(
    @Req() req: AuthenticatedRequest,
    @Query() query: PaginateOrdersDto,
  ) {
    return this.onRampService.getOrders(
      req.user.id,
      query.page ?? 1,
      query.limit ?? 20,
    );
  }

  @Get('orders/:id')
  @ApiOkResponse({ type: OnRampOrder })
  getOrderById(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<OnRampOrder> {
    return this.onRampService.getOrderById(req.user.id, id);
  }
}
