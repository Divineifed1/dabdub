import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import {
  ComplianceReportType,
  ReportFormat,
  ComplianceReportStatus,
} from '../enums/compliance-report.enum';

@Entity('compliance_reports')
export class ComplianceReport {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: ComplianceReportType })
  reportType: ComplianceReportType;

  @Column({ type: 'enum', enum: ComplianceReportStatus, default: ComplianceReportStatus.QUEUED })
  status: ComplianceReportStatus;

  @Column({ type: 'enum', enum: ReportFormat })
  format: ReportFormat;

  @Column({ type: 'date' })
  startDate: string;

  @Column({ type: 'date' })
  endDate: string;

  @Column({ nullable: true, type: 'uuid' })
  merchantId: string | null;

  @Column({ nullable: true, type: 'text' })
  notes: string | null;

  @Column({ nullable: true, type: 'int' })
  rowCount: number | null;

  @Column({ nullable: true, type: 'bigint' })
  fileSizeBytes: number | null;

  @Column({ nullable: true, type: 'varchar' })
  s3Key: string | null;

  @Column({ nullable: true, type: 'varchar' })
  errorMessage: string | null;

  @Column({ nullable: true, type: 'timestamptz' })
  generatedAt: Date | null;

  @Column({ nullable: true, type: 'timestamptz' })
  expiresAt: Date | null;

  /** Admin user who requested this report */
  @Column({ type: 'uuid' })
  requestedById: string;

  @Column({ type: 'varchar' })
  requestedByEmail: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
