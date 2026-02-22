import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Readable } from 'stream';

@Injectable()
export class ComplianceStorageService {
  private readonly logger = new Logger(ComplianceStorageService.name);
  private readonly s3: S3Client;
  private readonly bucket: string;

  /** Pre-signed URL validity: 7 days in seconds */
  private readonly PRESIGNED_URL_TTL_SECONDS = 7 * 24 * 60 * 60;

  constructor(private readonly config: ConfigService) {
    this.s3 = new S3Client({
      region: this.config.getOrThrow<string>('AWS_REGION'),
      credentials: {
        accessKeyId: this.config.getOrThrow<string>('AWS_ACCESS_KEY_ID'),
        secretAccessKey: this.config.getOrThrow<string>('AWS_SECRET_ACCESS_KEY'),
      },
    });
    this.bucket = this.config.getOrThrow<string>('COMPLIANCE_S3_BUCKET');
  }

  /**
   * Upload a report buffer to S3.
   * @returns s3Key The object key used for later retrieval / deletion.
   */
  async uploadReport(
    reportId: string,
    content: Buffer | string,
    contentType: string,
    extension: string,
  ): Promise<{ s3Key: string; fileSizeBytes: number }> {
    const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf-8');
    const s3Key = `compliance-reports/${reportId}.${extension}`;

    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: s3Key,
        Body: buffer,
        ContentType: contentType,
        // S3 lifecycle rule handles deletion after 30 days — configured in Terraform / CDK.
        // Object tagging lets the lifecycle rule target only compliance reports.
        Tagging: 'Category=compliance-report',
      }),
    );

    this.logger.log(`Uploaded compliance report: s3://${this.bucket}/${s3Key} (${buffer.length} bytes)`);
    return { s3Key, fileSizeBytes: buffer.length };
  }

  /**
   * Generate a pre-signed GET URL valid for 7 days.
   */
  async getPresignedDownloadUrl(s3Key: string): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: s3Key,
    });

    return getSignedUrl(this.s3, command, {
      expiresIn: this.PRESIGNED_URL_TTL_SECONDS,
    });
  }

  /**
   * Delete an object from S3 (used for manual cleanup or re-generation).
   */
  async deleteReport(s3Key: string): Promise<void> {
    await this.s3.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: s3Key }),
    );
    this.logger.log(`Deleted compliance report from S3: ${s3Key}`);
  }

  /**
   * Content type + extension mapping for report formats.
   */
  static contentTypeFor(format: string): { contentType: string; extension: string } {
    switch (format) {
      case 'CSV':
        return { contentType: 'text/csv', extension: 'csv' };
      case 'XLSX':
        return {
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          extension: 'xlsx',
        };
      case 'PDF':
        return { contentType: 'application/pdf', extension: 'pdf' };
      default:
        return { contentType: 'application/octet-stream', extension: 'bin' };
    }
  }
}
