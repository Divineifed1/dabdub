import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import {
  TRANSACTION_REPORT_HEADERS,
  TransactionReportRow,
} from '../interfaces/transaction-report-row.interface';
import { ComplianceReportType, ReportFormat } from '../enums/compliance-report.enum';

interface ReportBuildResult {
  content: Buffer;
  rowCount: number;
}

@Injectable()
export class ReportBuilderService {
  private readonly logger = new Logger(ReportBuilderService.name);

  constructor(private readonly dataSource: DataSource) {}

  async build(
    reportType: ComplianceReportType,
    format: ReportFormat,
    startDate: string,
    endDate: string,
    merchantId?: string,
  ): Promise<ReportBuildResult> {
    switch (reportType) {
      case ComplianceReportType.TRANSACTION_REPORT:
        return this.buildTransactionReport(format, startDate, endDate, merchantId);
      case ComplianceReportType.MERCHANT_DUE_DILIGENCE:
        return this.buildMerchantDueDiligenceReport(format, startDate, endDate, merchantId);
      case ComplianceReportType.AML_SUMMARY:
        return this.buildAmlSummaryReport(format, startDate, endDate, merchantId);
      case ComplianceReportType.FEE_REPORT:
        return this.buildFeeReport(format, startDate, endDate, merchantId);
      case ComplianceReportType.SETTLEMENT_REPORT:
        return this.buildSettlementReport(format, startDate, endDate, merchantId);
      default:
        throw new Error(`Unsupported report type: ${reportType}`);
    }
  }

  // ---------------------------------------------------------------------------
  // TRANSACTION REPORT — AML/CFT mandated field order
  // ---------------------------------------------------------------------------

  private async buildTransactionReport(
    format: ReportFormat,
    startDate: string,
    endDate: string,
    merchantId?: string,
  ): Promise<ReportBuildResult> {
    const query = this.dataSource
      .createQueryBuilder()
      .select([
        'CURRENT_DATE::text AS "reportDate"',
        't.id AS "transactionId"',
        'm.id AS "merchantId"',
        'm.name AS "merchantName"',
        'm.country AS "merchantCountry"',
        't.chain AS "chain"',
        't.tx_hash AS "txHash"',
        't.block_number AS "blockNumber"',
        't.from_address AS "fromAddress"',
        't.to_address AS "toAddress"',
        't.token_symbol AS "tokenSymbol"',
        't.token_amount AS "tokenAmount"',
        't.usd_amount AS "usdAmount"',
        't.exchange_rate AS "exchangeRate"',
        't.platform_fee_usd AS "platformFeeUsd"',
        't.network_fee_usd AS "networkFeeUsd"',
        't.merchant_payout_usd AS "merchantPayoutUsd"',
        't.status AS "status"',
        't.confirmed_at AS "confirmedAt"',
        't.settled_at AS "settledAt"',
        's.id AS "settlementId"',
        's.bank_transfer_ref AS "bankTransferRef"',
        `COALESCE(array_to_string(t.risk_flags, ','), '') AS "riskFlags"`,
      ])
      .from('transactions', 't')
      .leftJoin('merchants', 'm', 'm.id = t.merchant_id')
      .leftJoin('settlements', 's', 's.id = t.settlement_id')
      .where('t.created_at >= :startDate', { startDate })
      .andWhere('t.created_at < :endDate', { endDate: this.nextDay(endDate) })
      .orderBy('t.created_at', 'ASC');

    if (merchantId) {
      query.andWhere('t.merchant_id = :merchantId', { merchantId });
    }

    const rows: TransactionReportRow[] = await query.getRawMany();
    this.logger.log(`Transaction report rows fetched: ${rows.length}`);

    return {
      content: await this.serialize(rows, TRANSACTION_REPORT_HEADERS, format),
      rowCount: rows.length,
    };
  }

  // ---------------------------------------------------------------------------
  // MERCHANT DUE DILIGENCE REPORT
  // ---------------------------------------------------------------------------

  private async buildMerchantDueDiligenceReport(
    format: ReportFormat,
    startDate: string,
    endDate: string,
    merchantId?: string,
  ): Promise<ReportBuildResult> {
    const headers = [
      'merchantId',
      'merchantName',
      'country',
      'registrationNumber',
      'kycStatus',
      'kycCompletedAt',
      'riskRating',
      'lastReviewedAt',
      'transactionCount',
      'totalVolumeUsd',
      'flaggedTransactions',
    ];

    const query = this.dataSource
      .createQueryBuilder()
      .select([
        'm.id AS "merchantId"',
        'm.name AS "merchantName"',
        'm.country AS "country"',
        'm.registration_number AS "registrationNumber"',
        'm.kyc_status AS "kycStatus"',
        'm.kyc_completed_at AS "kycCompletedAt"',
        'm.risk_rating AS "riskRating"',
        'm.last_reviewed_at AS "lastReviewedAt"',
        'COUNT(t.id) AS "transactionCount"',
        'COALESCE(SUM(t.usd_amount), 0) AS "totalVolumeUsd"',
        `COUNT(t.id) FILTER (WHERE t.risk_flags IS NOT NULL AND array_length(t.risk_flags, 1) > 0) AS "flaggedTransactions"`,
      ])
      .from('merchants', 'm')
      .leftJoin(
        'transactions',
        't',
        't.merchant_id = m.id AND t.created_at >= :startDate AND t.created_at < :endDate',
        { startDate, endDate: this.nextDay(endDate) },
      )
      .groupBy('m.id')
      .orderBy('m.name', 'ASC');

    if (merchantId) {
      query.andWhere('m.id = :merchantId', { merchantId });
    }

    const rows = await query.getRawMany();
    return { content: await this.serialize(rows, headers, format), rowCount: rows.length };
  }

  // ---------------------------------------------------------------------------
  // AML SUMMARY REPORT
  // ---------------------------------------------------------------------------

  private async buildAmlSummaryReport(
    format: ReportFormat,
    startDate: string,
    endDate: string,
    merchantId?: string,
  ): Promise<ReportBuildResult> {
    const headers = [
      'merchantId',
      'merchantName',
      'periodStart',
      'periodEnd',
      'totalTransactions',
      'totalVolumeUsd',
      'flaggedCount',
      'flaggedVolumeUsd',
      'uniqueSenders',
      'highRiskJurisdictions',
      'strFiled',
      'sarFiled',
    ];

    const query = this.dataSource
      .createQueryBuilder()
      .select([
        'm.id AS "merchantId"',
        'm.name AS "merchantName"',
        ':startDate AS "periodStart"',
        ':endDate AS "periodEnd"',
        'COUNT(t.id) AS "totalTransactions"',
        'COALESCE(SUM(t.usd_amount), 0) AS "totalVolumeUsd"',
        `COUNT(t.id) FILTER (WHERE array_length(t.risk_flags, 1) > 0) AS "flaggedCount"`,
        `COALESCE(SUM(t.usd_amount) FILTER (WHERE array_length(t.risk_flags, 1) > 0), 0) AS "flaggedVolumeUsd"`,
        'COUNT(DISTINCT t.from_address) AS "uniqueSenders"',
        'COUNT(DISTINCT t.high_risk_jurisdiction) AS "highRiskJurisdictions"',
        `COUNT(t.id) FILTER (WHERE t.str_filed = true) AS "strFiled"`,
        `COUNT(t.id) FILTER (WHERE t.sar_filed = true) AS "sarFiled"`,
      ])
      .from('merchants', 'm')
      .leftJoin(
        'transactions',
        't',
        't.merchant_id = m.id AND t.created_at >= :startDate AND t.created_at < :endDate',
        { startDate, endDate: this.nextDay(endDate) },
      )
      .groupBy('m.id')
      .setParameter('startDate', startDate)
      .setParameter('endDate', endDate);

    if (merchantId) {
      query.andWhere('m.id = :merchantId', { merchantId });
    }

    const rows = await query.getRawMany();
    return { content: await this.serialize(rows, headers, format), rowCount: rows.length };
  }

  // ---------------------------------------------------------------------------
  // FEE REPORT
  // ---------------------------------------------------------------------------

  private async buildFeeReport(
    format: ReportFormat,
    startDate: string,
    endDate: string,
    merchantId?: string,
  ): Promise<ReportBuildResult> {
    const headers = [
      'transactionId',
      'merchantId',
      'merchantName',
      'chain',
      'txHash',
      'tokenSymbol',
      'tokenAmount',
      'usdAmount',
      'platformFeeUsd',
      'platformFeePercent',
      'networkFeeUsd',
      'totalFeesUsd',
      'merchantPayoutUsd',
      'status',
      'confirmedAt',
    ];

    const query = this.dataSource
      .createQueryBuilder()
      .select([
        't.id AS "transactionId"',
        'm.id AS "merchantId"',
        'm.name AS "merchantName"',
        't.chain AS "chain"',
        't.tx_hash AS "txHash"',
        't.token_symbol AS "tokenSymbol"',
        't.token_amount AS "tokenAmount"',
        't.usd_amount AS "usdAmount"',
        't.platform_fee_usd AS "platformFeeUsd"',
        'ROUND((t.platform_fee_usd / NULLIF(t.usd_amount, 0)) * 100, 4) AS "platformFeePercent"',
        't.network_fee_usd AS "networkFeeUsd"',
        '(t.platform_fee_usd + t.network_fee_usd) AS "totalFeesUsd"',
        't.merchant_payout_usd AS "merchantPayoutUsd"',
        't.status AS "status"',
        't.confirmed_at AS "confirmedAt"',
      ])
      .from('transactions', 't')
      .leftJoin('merchants', 'm', 'm.id = t.merchant_id')
      .where('t.created_at >= :startDate', { startDate })
      .andWhere('t.created_at < :endDate', { endDate: this.nextDay(endDate) })
      .orderBy('t.confirmed_at', 'ASC');

    if (merchantId) {
      query.andWhere('t.merchant_id = :merchantId', { merchantId });
    }

    const rows = await query.getRawMany();
    return { content: await this.serialize(rows, headers, format), rowCount: rows.length };
  }

  // ---------------------------------------------------------------------------
  // SETTLEMENT REPORT
  // ---------------------------------------------------------------------------

  private async buildSettlementReport(
    format: ReportFormat,
    startDate: string,
    endDate: string,
    merchantId?: string,
  ): Promise<ReportBuildResult> {
    const headers = [
      'settlementId',
      'merchantId',
      'merchantName',
      'bankTransferRef',
      'totalTransactions',
      'grossVolumeUsd',
      'totalFeesUsd',
      'netPayoutUsd',
      'currency',
      'settlementStatus',
      'initiatedAt',
      'completedAt',
    ];

    const query = this.dataSource
      .createQueryBuilder()
      .select([
        's.id AS "settlementId"',
        'm.id AS "merchantId"',
        'm.name AS "merchantName"',
        's.bank_transfer_ref AS "bankTransferRef"',
        'COUNT(t.id) AS "totalTransactions"',
        'COALESCE(SUM(t.usd_amount), 0) AS "grossVolumeUsd"',
        'COALESCE(SUM(t.platform_fee_usd + t.network_fee_usd), 0) AS "totalFeesUsd"',
        's.net_payout_usd AS "netPayoutUsd"',
        's.currency AS "currency"',
        's.status AS "settlementStatus"',
        's.initiated_at AS "initiatedAt"',
        's.completed_at AS "completedAt"',
      ])
      .from('settlements', 's')
      .leftJoin('merchants', 'm', 'm.id = s.merchant_id')
      .leftJoin('transactions', 't', 't.settlement_id = s.id')
      .where('s.initiated_at >= :startDate', { startDate })
      .andWhere('s.initiated_at < :endDate', { endDate: this.nextDay(endDate) })
      .groupBy('s.id, m.id')
      .orderBy('s.initiated_at', 'ASC');

    if (merchantId) {
      query.andWhere('s.merchant_id = :merchantId', { merchantId });
    }

    const rows = await query.getRawMany();
    return { content: await this.serialize(rows, headers, format), rowCount: rows.length };
  }

  // ---------------------------------------------------------------------------
  // SERIALIZATION
  // ---------------------------------------------------------------------------

  private async serialize(
    rows: Record<string, unknown>[],
    headers: string[],
    format: ReportFormat,
  ): Promise<Buffer> {
    switch (format) {
      case ReportFormat.CSV:
        return this.toCsv(rows, headers);
      case ReportFormat.XLSX:
        return this.toXlsx(rows, headers);
      case ReportFormat.PDF:
        return this.toPdf(rows, headers);
      default:
        return this.toCsv(rows, headers);
    }
  }

  private toCsv(rows: Record<string, unknown>[], headers: string[]): Buffer {
    const escape = (val: unknown): string => {
      if (val === null || val === undefined) return '';
      const str = String(val);
      // RFC 4180 CSV escaping
      if (str.includes('"') || str.includes(',') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const headerLine = headers.join(',');
    const dataLines = rows.map((row) =>
      headers.map((h) => escape(row[h])).join(','),
    );

    return Buffer.from([headerLine, ...dataLines].join('\n'), 'utf-8');
  }

  private async toXlsx(rows: Record<string, unknown>[], headers: string[]): Promise<Buffer> {
    // Dynamic import to keep it optional — install: npm i exceljs
    const ExcelJS = await import('exceljs');
    const workbook = new ExcelJS.default.Workbook();
    const sheet = workbook.addWorksheet('Report');

    sheet.addRow(headers);
    for (const row of rows) {
      sheet.addRow(headers.map((h) => row[h] ?? ''));
    }

    // Style header row
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFD9E1F2' },
    };

    return workbook.xlsx.writeBuffer() as Promise<Buffer>;
  }

  private async toPdf(rows: Record<string, unknown>[], headers: string[]): Promise<Buffer> {
    // Dynamic import — install: npm i pdfkit
    const PDFDocument = (await import('pdfkit')).default;
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 30, layout: 'landscape' });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc.fontSize(14).text('Compliance Report', { align: 'center' });
      doc.moveDown();

      // Simple table rendering
      const colWidth = (doc.page.width - 60) / Math.min(headers.length, 8);
      const visibleHeaders = headers.slice(0, 8);

      doc.fontSize(8).font('Helvetica-Bold');
      visibleHeaders.forEach((h, i) => {
        doc.text(h, 30 + i * colWidth, doc.y, { width: colWidth, continued: i < visibleHeaders.length - 1 });
      });
      doc.moveDown(0.5);
      doc.font('Helvetica');

      for (const row of rows.slice(0, 500)) {
        const y = doc.y;
        visibleHeaders.forEach((h, i) => {
          doc.text(String(row[h] ?? ''), 30 + i * colWidth, y, {
            width: colWidth,
            continued: i < visibleHeaders.length - 1,
          });
        });
        doc.moveDown(0.3);

        if (doc.y > doc.page.height - 60) {
          doc.addPage();
        }
      }

      if (rows.length > 500) {
        doc.moveDown().fontSize(10).text(`(${rows.length - 500} more rows — download CSV for full data)`);
      }

      doc.end();
    });
  }

  // ---------------------------------------------------------------------------
  // HELPERS
  // ---------------------------------------------------------------------------

  private nextDay(dateStr: string): string {
    const d = new Date(dateStr);
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
  }
}
