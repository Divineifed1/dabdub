import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class ComplianceEmailService {
  private readonly logger = new Logger(ComplianceEmailService.name);
  private readonly transporter: nodemailer.Transporter;
  private readonly fromAddress: string;

  constructor(private readonly config: ConfigService) {
    this.fromAddress = this.config.getOrThrow<string>('COMPLIANCE_EMAIL_FROM');

    this.transporter = nodemailer.createTransport({
      host: this.config.getOrThrow<string>('SMTP_HOST'),
      port: this.config.get<number>('SMTP_PORT', 587),
      secure: this.config.get<boolean>('SMTP_SECURE', false),
      auth: {
        user: this.config.getOrThrow<string>('SMTP_USER'),
        pass: this.config.getOrThrow<string>('SMTP_PASS'),
      },
    });
  }

  async sendReportReady(
    recipientEmail: string,
    reportId: string,
    reportType: string,
    rowCount: number,
    downloadUrl: string,
    expiresAt: Date,
  ): Promise<void> {
    const expiryStr = expiresAt.toUTCString();

    await this.transporter.sendMail({
      from: this.fromAddress,
      to: recipientEmail,
      subject: `[Compliance] ${reportType} report is ready`,
      html: `
        <h2>Your compliance report is ready</h2>
        <p><strong>Report ID:</strong> ${reportId}</p>
        <p><strong>Type:</strong> ${reportType}</p>
        <p><strong>Total rows:</strong> ${rowCount.toLocaleString()}</p>
        <p><strong>Download link (expires ${expiryStr}):</strong><br/>
          <a href="${downloadUrl}">${downloadUrl}</a>
        </p>
        <p style="color:#888;font-size:12px;">
          This link is pre-signed and valid for 7 days. Do not share it externally.
        </p>
      `,
    });

    this.logger.log(`Report-ready email sent to ${recipientEmail} for report ${reportId}`);
  }

  async sendReportFailed(
    recipientEmail: string,
    reportId: string,
    reportType: string,
    errorMessage: string,
  ): Promise<void> {
    await this.transporter.sendMail({
      from: this.fromAddress,
      to: recipientEmail,
      subject: `[Compliance] FAILED: ${reportType} report could not be generated`,
      html: `
        <h2>Compliance report generation failed</h2>
        <p><strong>Report ID:</strong> ${reportId}</p>
        <p><strong>Type:</strong> ${reportType}</p>
        <p><strong>Error:</strong> ${errorMessage}</p>
        <p>Please contact the platform engineering team or retry the report.</p>
      `,
    });

    this.logger.warn(`Report-failure email sent to ${recipientEmail} for report ${reportId}`);
  }
}
