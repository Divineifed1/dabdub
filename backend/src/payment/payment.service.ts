import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Payment, PaymentStatus } from '../database/entities/payment.entity';
import * as QRCode from 'qrcode';

import { PaymentMetrics } from './payment.metrics';

@Injectable()
export class PaymentService {
  constructor(
    @InjectRepository(Payment)
    private readonly paymentRepository: Repository<Payment>,
    private readonly metrics: PaymentMetrics,
  ) {}

  async getPaymentDetails(id: string): Promise<Payment> {
    const payment = await this.paymentRepository.findOne({ where: { id } });
    if (!payment) {
      throw new NotFoundException('Payment not found');
    }
    return payment;
  }

  async getPaymentStatus(id: string): Promise<{ status: PaymentStatus }> {
    const payment = await this.getPaymentDetails(id);
    return { status: payment.status };
  }

  async generateQR(id: string): Promise<Buffer> {
    const payment = await this.getPaymentDetails(id);
    const url = `https://example.com/payment/${id}`;
    return QRCode.toBuffer(url);
  }

  async handleNotify(id: string, data: any): Promise<void> {
    const payment = await this.getPaymentDetails(id);
    if (data.status) {
      payment.status = data.status;
      await this.paymentRepository.save(payment);

      if (data.status === PaymentStatus.COMPLETED) {
        this.metrics.incrementPaymentProcessed(payment.currency || 'USD');
      } else if (data.status === PaymentStatus.FAILED) {
        this.metrics.incrementPaymentFailed(
          payment.currency || 'USD',
          data.reason || 'unknown',
        );
      }
    }
  }

  getNetworks(): string[] {
    return ['ethereum', 'polygon', 'bsc'];
  }

  getExchangeRates(): Record<string, number> {
    return {
      'ETH/USD': 3000,
      'MATIC/USD': 1.5,
      'BNB/USD': 400,
    };
  }
}
