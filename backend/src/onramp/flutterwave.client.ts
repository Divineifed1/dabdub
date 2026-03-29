import {
  Injectable,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface CreateVirtualAccountInput {
  amountNgn: number;
  customerEmail: string;
  customerName: string;
  txRef: string;
}

export interface VirtualAccountDetails {
  accountNumber: string;
  bankName: string;
  accountName: string | null;
  flutterwaveReference: string | null;
  expiresAt: Date | null;
}

interface FlutterwaveVirtualAccountResponse {
  status?: string;
  message?: string;
  data?: {
    account_number?: string;
    bank_name?: string;
    account_name?: string;
    flw_ref?: string;
    expires_at?: string;
  };
}

@Injectable()
export class FlutterwaveClient {
  private readonly logger = new Logger(FlutterwaveClient.name);

  constructor(private readonly configService: ConfigService) {}

  async createVirtualAccount(
    input: CreateVirtualAccountInput,
  ): Promise<VirtualAccountDetails> {
    const secretKey = this.configService.get<string>('FLUTTERWAVE_SECRET_KEY');
    if (!secretKey) {
      throw new ServiceUnavailableException(
        'Flutterwave integration is not configured',
      );
    }

    const baseUrl =
      this.configService.get<string>('FLUTTERWAVE_BASE_URL') ??
      'https://api.flutterwave.com/v3';

    const response = await fetch(`${baseUrl}/virtual-account-numbers`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        email: input.customerEmail,
        amount: input.amountNgn,
        currency: 'NGN',
        tx_ref: input.txRef,
        narration: `USDC on-ramp ${input.txRef}`,
        is_permanent: false,
        firstname: input.customerName,
      }),
    });

    const payload =
      (await response.json()) as FlutterwaveVirtualAccountResponse;

    if (
      !response.ok ||
      payload.status !== 'success' ||
      !payload.data?.account_number
    ) {
      this.logger.error(
        `Flutterwave virtual account creation failed: ${response.status} ${JSON.stringify(payload)}`,
      );
      throw new InternalServerErrorException(
        'Unable to create virtual account',
      );
    }

    return {
      accountNumber: payload.data.account_number,
      bankName: payload.data.bank_name ?? 'Unknown bank',
      accountName: payload.data.account_name ?? null,
      flutterwaveReference: payload.data.flw_ref ?? null,
      expiresAt: payload.data.expires_at
        ? new Date(payload.data.expires_at)
        : null,
    };
  }
}
