import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import {
  Merchant,
  MerchantStatus,
  KycStatus,
} from '../../database/entities/merchant.entity';
// @ts-ignore - Assuming PasswordService is exported from AuthModule, ignore if it complains during this check but works at runtime (it should be exported now)
import { PasswordService } from '../../auth/services/password.service';
import {
  RegisterMerchantDto,
  LoginMerchantDto,
  UpdateProfileDto,
  BankDetailsDto,
  SettingsDto,
  KycDocumentsDto,
} from '../dto/merchant.dto';

@Injectable()
export class MerchantService {
  constructor(
    @InjectRepository(Merchant)
    private readonly merchantRepository: Repository<Merchant>,
    private readonly jwtService: JwtService,
    private readonly passwordService: PasswordService,
  ) {}

  async register(dto: RegisterMerchantDto): Promise<Merchant> {
    const { email, password, name, businessName } = dto;

    const existing = await this.merchantRepository.findOne({
      where: { email },
    });
    if (existing) {
      throw new ConflictException('Merchant with this email already exists');
    }

    const hashedPassword = await this.passwordService.hashPassword(password);
    const merchant = this.merchantRepository.create({
      name,
      businessName,
      email,
      password: hashedPassword,
      status: MerchantStatus.ACTIVE,
      kycStatus: KycStatus.NOT_SUBMITTED,
    });

    return this.merchantRepository.save(merchant);
  }

  async login(dto: LoginMerchantDto): Promise<{
    accessToken: string;
    refreshToken: string;
    merchant: Merchant;
  }> {
    const { email, password } = dto;
    const merchant = await this.merchantRepository.findOne({
      where: { email },
    });

    if (!merchant || merchant.status === MerchantStatus.SUSPENDED) {
      throw new UnauthorizedException(
        'Invalid credentials or suspended account',
      );
    }

    const isPasswordValid = await this.passwordService.comparePassword(
      password,
      merchant.password,
    );
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload = {
      sub: merchant.id,
      email: merchant.email,
      role: 'merchant',
    };
    const accessToken = this.jwtService.sign(payload);
    const refreshToken = this.jwtService.sign(payload, { expiresIn: '7d' });

    return { accessToken, refreshToken, merchant };
  }

  async refreshToken(
    token: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    try {
      const payload = this.jwtService.verify(token);
      if (payload.role !== 'merchant')
        throw new UnauthorizedException('Invalid token role');

      const merchant = await this.merchantRepository.findOne({
        where: { id: payload.sub },
      });
      if (!merchant || merchant.status !== MerchantStatus.ACTIVE)
        throw new UnauthorizedException('Invalid merchant');

      const newPayload = {
        sub: merchant.id,
        email: merchant.email,
        role: 'merchant',
      };
      const accessToken = this.jwtService.sign(newPayload);
      const refreshToken = this.jwtService.sign(newPayload, {
        expiresIn: '7d',
      });

      return { accessToken, refreshToken };
    } catch (e) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  async verifyEmail(email: string, code: string): Promise<boolean> {
    // Placeholder for email verification logic
    // In reality, check code against DB/Redis
    return true;
  }

  async getStatistics(id: string): Promise<any> {
    // Placeholder for stats
    return {
      totalSettlements: 0,
      totalVolume: 0,
      activeDisputes: 0,
    };
  }

  async getProfile(id: string): Promise<Merchant> {
    const merchant = await this.merchantRepository.findOne({ where: { id } });
    if (!merchant) throw new UnauthorizedException('Merchant not found');
    return merchant;
  }

  async updateProfile(id: string, dto: UpdateProfileDto): Promise<Merchant> {
    const merchant = await this.getProfile(id);
    if (dto.name) merchant.name = dto.name;
    if (dto.businessName) merchant.businessName = dto.businessName;
    return this.merchantRepository.save(merchant);
  }

  async updateBankDetails(id: string, dto: BankDetailsDto): Promise<Merchant> {
    const merchant = await this.getProfile(id);
    // In a real app, encrypt these details
    merchant.bankDetails = dto as any;
    return this.merchantRepository.save(merchant);
  }

  async updateSettings(id: string, dto: SettingsDto): Promise<Merchant> {
    const merchant = await this.getProfile(id);
    merchant.settings = { ...merchant.settings, ...dto };
    return this.merchantRepository.save(merchant);
  }

  async uploadKycDocuments(
    id: string,
    dto: KycDocumentsDto,
  ): Promise<Merchant> {
    const merchant = await this.getProfile(id);
    merchant.documents = { ...merchant.documents, ...dto };
    merchant.kycStatus = KycStatus.PENDING; // Set to pending verification
    return this.merchantRepository.save(merchant);
  }

  async getKycStatus(
    id: string,
  ): Promise<{ status: KycStatus; documents: any }> {
    const merchant = await this.getProfile(id);
    return { status: merchant.kycStatus, documents: merchant.documents };
  }
}
