import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, MoreThanOrEqual, LessThanOrEqual } from 'typeorm';
import { Merchant, MerchantStatus } from '../database/entities/merchant.entity';
import { Payment } from '../database/entities/payment.entity';
import {
  Settlement,
  SettlementStatus,
} from '../settlement/entities/settlement.entity';
import { AuditLogService } from '../audit/audit-log.service';
import { AuditAction, ActorType } from '../database/entities/audit-log.enums';
import { AdminPaymentFiltersDto } from './dto/admin-payment-filters.dto';
import { AuditLogFiltersDto } from './dto/audit-log-filters.dto';
import { MerchantStatusUpdateDto } from './dto/merchant-status-update.dto';
import {
  ManualReconciliationDto,
  ReconciliationType,
} from './dto/manual-reconciliation.dto';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    @InjectRepository(Merchant)
    private readonly merchantRepo: Repository<Merchant>,
    @InjectRepository(Payment)
    private readonly paymentRepo: Repository<Payment>,
    @InjectRepository(Settlement)
    private readonly settlementRepo: Repository<Settlement>,
    private readonly auditLogService: AuditLogService,
  ) {}

  async getMerchantById(id: string) {
    const merchant = await this.merchantRepo.findOne({
      where: { id },
      relations: ['user'],
    });

    if (!merchant) {
      throw new NotFoundException(`Merchant with ID ${id} not found`);
    }

    // Get additional stats
    const [paymentCount, totalVolume] = await Promise.all([
      this.paymentRepo.count({ where: { merchantId: id } }),
      this.paymentRepo
        .createQueryBuilder('payment')
        .select('SUM(payment.amount)', 'total')
        .where('payment.merchantId = :id', { id })
        .getRawOne(),
    ]);

    return {
      ...merchant,
      stats: {
        paymentCount,
        totalVolume: totalVolume?.total || 0,
      },
    };
  }

  async updateMerchantStatus(
    id: string,
    updateDto: MerchantStatusUpdateDto,
    adminId: string,
    ipAddress?: string,
  ) {
    const merchant = await this.merchantRepo.findOne({ where: { id } });

    if (!merchant) {
      throw new NotFoundException(`Merchant with ID ${id} not found`);
    }

    const beforeState = { status: merchant.status };
    const oldStatus = merchant.status;

    merchant.status = updateDto.status;

    if (updateDto.status === MerchantStatus.ACTIVE && !merchant.activatedAt) {
      merchant.activatedAt = new Date();
    }

    const updated = await this.merchantRepo.save(merchant);

    // Audit log
    await this.auditLogService.log({
      entityType: 'Merchant',
      entityId: id,
      action: AuditAction.UPDATE,
      actorId: adminId,
      actorType: ActorType.ADMIN,
      beforeState,
      afterState: { status: updateDto.status },
      ipAddress,
      metadata: {
        reason: updateDto.reason,
        oldStatus,
        newStatus: updateDto.status,
      },
    });

    this.logger.log(
      `Admin ${adminId} changed merchant ${id} status from ${oldStatus} to ${updateDto.status}`,
    );

    return updated;
  }

  async getPayments(filters: AdminPaymentFiltersDto) {
    const {
      page = 1,
      limit = 20,
      status,
      merchantId,
      reference,
      fromDate,
      toDate,
      minAmount,
      maxAmount,
      currency,
      search,
    } = filters;

    const qb = this.paymentRepo.createQueryBuilder('payment');

    if (status) {
      qb.andWhere('payment.status = :status', { status });
    }

    if (merchantId) {
      qb.andWhere('payment.merchantId = :merchantId', { merchantId });
    }

    if (reference) {
      qb.andWhere('payment.reference ILIKE :reference', {
        reference: `%${reference}%`,
      });
    }

    if (fromDate) {
      qb.andWhere('payment.createdAt >= :fromDate', { fromDate });
    }

    if (toDate) {
      qb.andWhere('payment.createdAt <= :toDate', { toDate });
    }

    if (minAmount) {
      qb.andWhere('payment.amount >= :minAmount', { minAmount });
    }

    if (maxAmount) {
      qb.andWhere('payment.amount <= :maxAmount', { maxAmount });
    }

    if (currency) {
      qb.andWhere('payment.currency = :currency', { currency });
    }

    if (search) {
      qb.andWhere(
        '(payment.reference ILIKE :search OR payment.description ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    qb.orderBy('payment.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [data, total] = await qb.getManyAndCount();

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async retrySettlement(id: string, adminId: string, ipAddress?: string) {
    const settlement = await this.settlementRepo.findOne({ where: { id } });

    if (!settlement) {
      throw new NotFoundException(`Settlement with ID ${id} not found`);
    }

    if (settlement.status !== SettlementStatus.FAILED) {
      throw new BadRequestException(
        'Only failed settlements can be manually retried',
      );
    }

    const beforeState = {
      status: settlement.status,
      retryCount: settlement.retryCount,
    };

    settlement.status = SettlementStatus.PENDING;
    settlement.retryCount = 0;
    settlement.failureReason = null;

    const updated = await this.settlementRepo.save(settlement);

    // Audit log
    await this.auditLogService.log({
      entityType: 'Settlement',
      entityId: id,
      action: AuditAction.UPDATE,
      actorId: adminId,
      actorType: ActorType.ADMIN,
      beforeState,
      afterState: {
        status: settlement.status,
        retryCount: settlement.retryCount,
      },
      ipAddress,
      metadata: {
        action: 'manual_retry',
      },
    });

    this.logger.log(`Admin ${adminId} manually retried settlement ${id}`);

    return updated;
  }

  async getSystemMetrics() {
    const [
      totalMerchants,
      activeMerchants,
      totalPayments,
      totalSettlements,
      pendingSettlements,
    ] = await Promise.all([
      this.merchantRepo.count(),
      this.merchantRepo.count({ where: { status: MerchantStatus.ACTIVE } }),
      this.paymentRepo.count(),
      this.settlementRepo.count(),
      this.settlementRepo.count({
        where: { status: SettlementStatus.PENDING },
      }),
    ]);

    // Get payment volume
    const volumeResult = await this.paymentRepo
      .createQueryBuilder('payment')
      .select('SUM(payment.amount)', 'total')
      .getRawOne();

    return {
      merchants: {
        total: totalMerchants,
        active: activeMerchants,
      },
      payments: {
        total: totalPayments,
        volume: volumeResult?.total || 0,
      },
      settlements: {
        total: totalSettlements,
        pending: pendingSettlements,
      },
      timestamp: new Date().toISOString(),
    };
  }

  async getAuditLogs(filters: AuditLogFiltersDto) {
    const {
      page = 1,
      limit = 20,
      entityType,
      entityId,
      actorId,
      action,
      actorType,
      dataClassification,
      requestId,
      startDate,
      endDate,
    } = filters;

    const result = await this.auditLogService.search({
      entityType,
      entityId,
      actorId,
      action,
      dataClassification,
      requestId,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      limit,
      offset: (page - 1) * limit,
    });

    return {
      data: result.data,
      meta: {
        total: result.total,
        page,
        limit,
        totalPages: Math.ceil(result.total / limit),
      },
    };
  }

  async performManualReconciliation(
    dto: ManualReconciliationDto,
    adminId: string,
    ipAddress?: string,
  ) {
    let entity: any;
    let entityType: string;

    switch (dto.type) {
      case ReconciliationType.PAYMENT:
        entity = await this.paymentRepo.findOne({
          where: { id: dto.entityId },
        });
        entityType = 'Payment';
        break;
      case ReconciliationType.SETTLEMENT:
        entity = await this.settlementRepo.findOne({
          where: { id: dto.entityId },
        });
        entityType = 'Settlement';
        break;
      default:
        throw new BadRequestException(
          `Unsupported reconciliation type: ${dto.type}`,
        );
    }

    if (!entity) {
      throw new NotFoundException(
        `${entityType} with ID ${dto.entityId} not found`,
      );
    }

    // Audit log for reconciliation
    await this.auditLogService.log({
      entityType,
      entityId: dto.entityId,
      action: AuditAction.UPDATE,
      actorId: adminId,
      actorType: ActorType.ADMIN,
      beforeState: { status: entity.status },
      afterState: { reconciled: true },
      ipAddress,
      metadata: {
        reconciliationType: dto.type,
        reason: dto.reason,
        adjustmentAmount: dto.adjustmentAmount,
        notes: dto.notes,
      },
    });

    this.logger.log(
      `Admin ${adminId} performed manual reconciliation for ${entityType} ${dto.entityId}`,
    );

    return {
      success: true,
      entityType,
      entityId: dto.entityId,
      reconciledAt: new Date().toISOString(),
    };
  }
}
