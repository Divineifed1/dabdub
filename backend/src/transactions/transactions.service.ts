import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, MoreThanOrEqual, LessThanOrEqual } from 'typeorm';
import { Transaction } from './entities/transaction.entity';
import { TransactionQueryDto } from './dto/transaction-query.dto';
import * as puppeteer from 'puppeteer';
import { Readable } from 'stream';

@Injectable()
export class TransactionsService {
  constructor(
    @InjectRepository(Transaction)
    private transactionRepository: Repository<Transaction>,
  ) {}

  async findAll(query: TransactionQueryDto) {
    const {
      network,
      status,
      startDate,
      endDate,
      minAmount,
      maxAmount,
      page,
      limit,
      sortBy,
      sortOrder,
    } = query;

    const where: any = {};

    if (network) {
      where.network = network;
    }

    if (status) {
      where.status = status;
    }

    if (startDate && endDate) {
      where.createdAt = Between(new Date(startDate), new Date(endDate));
    } else if (startDate) {
      where.createdAt = MoreThanOrEqual(new Date(startDate));
    } else if (endDate) {
      where.createdAt = LessThanOrEqual(new Date(endDate));
    }

    if (minAmount) {
      where.amount = MoreThanOrEqual(minAmount);
    }
    // Note: range query for amount might need raw query if using string decimal column in a complex way,
    // but TypeORM handles basic comparisons well if configured or if we cast.
    // For now, assuming basic TypeORM behavior works or amount is castable.

    const [items, total] = await this.transactionRepository.findAndCount({
      where,
      order: {
        [sortBy]: sortOrder,
      },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      items,
      meta: {
        totalItems: total,
        itemCount: items.length,
        itemsPerPage: limit,
        totalPages: Math.ceil(total / limit),
        currentPage: page,
      },
    };
  }

  async findOne(id: string): Promise<Transaction> {
    const transaction = await this.transactionRepository.findOne({
      where: { id },
    });
    if (!transaction) {
      throw new NotFoundException(`Transaction with ID ${id} not found`);
    }
    return transaction;
  }

  async findByHash(txHash: string): Promise<Transaction> {
    const transaction = await this.transactionRepository.findOne({
      where: { txHash },
    });
    if (!transaction) {
      throw new NotFoundException(`Transaction with hash ${txHash} not found`);
    }
    return transaction;
  }

  async getConfirmations(id: string): Promise<{ confirmations: number }> {
    const transaction = await this.findOne(id);
    // In a real generic implementation, this would query a blockchain node or indexer.
    // For now, we simply return the stored confirmations or calculate based on current block height if available.
    return { confirmations: transaction.confirmations };
  }

  async export(
    query: TransactionQueryDto,
    format: 'csv' | 'pdf',
  ): Promise<Readable | Buffer> {
    // Override pagination for export - get all matching or a large limit
    const exportQuery = { ...query, page: 1, limit: 10000 };
    const { items } = await this.findAll(exportQuery);

    if (format === 'csv') {
      return this.generateCsv(items);
    } else {
      return this.generatePdf(items);
    }
  }

  private generateCsv(transactions: Transaction[]): Readable {
    const header = 'ID,Date,Network,Hash,From,To,Amount,Currency,Status\n';
    const rows = transactions
      .map(
        (t) =>
          `${t.id},${t.createdAt.toISOString()},${t.network},${t.txHash},${t.fromAddress},${t.toAddress},${t.amount},${t.currency},${t.status}`,
      )
      .join('\n');

    const stream = new Readable();
    stream.push(header + rows);
    stream.push(null);
    return stream;
  }

  private async generatePdf(transactions: Transaction[]): Promise<Buffer> {
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox'],
    });
    const page = await browser.newPage();

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; font-size: 12px; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          th { background-color: #f2f2f2; }
          h1 { text-align: center; }
        </style>
      </head>
      <body>
        <h1>Transaction Report</h1>
        <p>Generated on: ${new Date().toLocaleString()}</p>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Network</th>
              <th>Hash</th>
              <th>Amount</th>
              <th>Currency</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${transactions
              .map(
                (t) => `
              <tr>
                <td>${t.createdAt.toISOString()}</td>
                <td>${t.network}</td>
                <td>${t.txHash.substring(0, 10)}...</td>
                <td>${t.amount}</td>
                <td>${t.currency}</td>
                <td>${t.status}</td>
              </tr>
            `,
              )
              .join('')}
          </tbody>
        </table>
      </body>
      </html>
    `;

    await page.setContent(htmlContent);
    const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });

    await browser.close();

    // Convert Uint8Array to Buffer (Puppeteer returns Uint8Array in newer versions)
    return Buffer.from(pdfBuffer);
  }
}
