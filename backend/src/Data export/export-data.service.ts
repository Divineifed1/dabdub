import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ExportResourceType } from './export.enums';

interface FetchBatchResult {
  data: Record<string, unknown>[];
  nextCursor: string | null;
}

/**
 * Provides COUNT and cursor-paginated SELECT for each resource type.
 *
 * Cursor-based pagination uses the row's `id` (UUID) which is indexed,
 * ensuring consistent ordering and O(1) seek regardless of offset depth.
 */
@Injectable()
export class ExportDataService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) { }

  async countRows(
    resourceType: ExportResourceType,
    filters: Record<string, unknown>,
  ): Promise<number> {
    const { sql, params } = this.buildQuery(
      resourceType,
      filters,
      null,
      1,
      true,
    );
    const result = await this.dataSource.query(sql, params);
    return parseInt(result[0].count, 10);
  }

  async fetchBatch(
    resourceType: ExportResourceType,
    filters: Record<string, unknown>,
    cursor: string | null,
    batchSize: number,
  ): Promise<FetchBatchResult> {
    const { sql, params } = this.buildQuery(
      resourceType,
      filters,
      cursor,
      batchSize,
      false,
    );
    const rows: Record<string, unknown>[] = await this.dataSource.query(
      sql,
      params,
    );

    const nextCursor =
      rows.length === batchSize ? String(rows[rows.length - 1]['id']) : null;

    return { data: rows, nextCursor };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private buildQuery(
    resourceType: ExportResourceType,
    filters: Record<string, unknown>,
    cursor: string | null,
    limit: number,
    countOnly: boolean,
  ): { sql: string; params: unknown[] } {
    const table = this.tableFor(resourceType);
    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    // Generic date range filters
    if (filters['startDate']) {
      conditions.push(`created_at >= $${idx++}`);
      params.push(filters['startDate']);
    }
    if (filters['endDate']) {
      conditions.push(`created_at <= $${idx++}`);
      params.push(filters['endDate']);
    }
    if (filters['status']) {
      conditions.push(`status = $${idx++}`);
      params.push(filters['status']);
    }
    if (filters['merchantId']) {
      conditions.push(`merchant_id = $${idx++}`);
      params.push(filters['merchantId']);
    }

    // Cursor-based pagination
    if (cursor) {
      conditions.push(`id > $${idx++}`);
      params.push(cursor);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    if (countOnly) {
      return { sql: `SELECT COUNT(*) AS count FROM ${table} ${where}`, params };
    }

    const sql = `SELECT * FROM ${table} ${where} ORDER BY id ASC LIMIT ${limit}`;
    return { sql, params };
  }

  private tableFor(resourceType: ExportResourceType): string {
    const map: Record<ExportResourceType, string> = {
      [ExportResourceType.TRANSACTIONS]: 'transactions',
      [ExportResourceType.MERCHANTS]: 'merchants',
      [ExportResourceType.SETTLEMENTS]: 'settlements',
      [ExportResourceType.AUDIT_LOGS]: 'audit_logs',
      [ExportResourceType.REFUNDS]: 'refunds',
    };
    return map[resourceType];
  }
}
