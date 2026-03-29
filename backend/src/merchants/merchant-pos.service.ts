import {
  Injectable,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';
import { QrService } from '../../qr/qr.service';
import { PosQrResponseDto } from './dto/pos-qr-response.dto';
import { Merchant } from './entities/merchant.entity';
import { User } from '../users/entities/user.entity';

@Injectable()
export class MerchantPosService {
  constructor(
    @InjectRepository(Merchant)
    private readonly merchantRepo: Repository<Merchant>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly qrService: QrService,
    @InjectRedis() private readonly redis: Redis,
  ) {}

  async getPosQr(user: User): Promise<PosQrResponseDto> {
    if (!user.isMerchant) {
      throw new ForbiddenException('Merchant account required');
    }

    const merchant = await this.merchantRepo.findOne({
      where: { userId: user.id },
    });
    if (!merchant) {
      throw new NotFoundException('Merchant profile not found');
    }

    const { qrDataUrl, paymentUrl } = await this.qrService.generatePosQr(
      user.username,
      merchant.id,
    );

    const logoUrl = merchant.logoKey 
      ? `https://pub-r2.example.com/${merchant.logoKey}` // TODO: Use uploads public URL service
      : null;

    return {
      qrDataUrl,
      paymentUrl,
      username: user.username,
      businessName: merchant.businessName,
      logoUrl,
      isVerified: merchant.isVerified,
      tier: user.tier,
    };
  }

  async getPosQrWithAmount(
    merchantId: string,
    amount: number,
    note?: string,
  ): Promise<PosQrResponseDto> {
    const merchant = await this.merchantRepo.findOne({ where: { id: merchantId } });
    if (!merchant) {
      throw new NotFoundException('Merchant not found');
    }

    const user = await this.userRepo.findOne({ where: { id: merchant.userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const { qrDataUrl, paymentUrl } = await this.qrService.generatePosQr(
      user.username,
      merchantId,
      amount.toString(),
      note,
    );

    const logoUrl = merchant.logoKey 
      ? `https://pub-r2.example.com/${merchant.logoKey}`
      : null;

    return {
      qrDataUrl,
      paymentUrl,
      username: user.username,
      businessName: merchant.businessName,
      logoUrl,
      isVerified: merchant.isVerified,
      tier: user.tier,
    };
  }

  async regenerate(merchantId: string): Promise<void> {
    await this.redis.del(`pos:qr:${merchantId}`);
  }
}
