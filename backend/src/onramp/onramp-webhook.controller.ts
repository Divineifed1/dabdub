import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiExcludeEndpoint } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Public } from '../auth/decorators/public.decorator';
import { OnRampService } from './onramp.service';

@Controller('webhooks/flutterwave')
export class OnRampWebhookController {
  constructor(
    private readonly onRampService: OnRampService,
    private readonly configService: ConfigService,
  ) {}

  @Public()
  @Post()
  @HttpCode(200)
  @ApiExcludeEndpoint()
  async handle(
    @Headers('verif-hash') verifHash: string | undefined,
    @Body() payload: Record<string, unknown>,
  ): Promise<{ status: 'ok' }> {
    const secret = this.configService.get<string>('FLUTTERWAVE_WEBHOOK_SECRET');

    if (!secret || verifHash !== secret) {
      throw new UnauthorizedException('Invalid Flutterwave webhook signature');
    }

    await this.onRampService.handleWebhook(payload);
    return { status: 'ok' };
  }
}
