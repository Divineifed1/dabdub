# Compliance Report Generation — NestJS Module

Automated AML/CFT-compliant financial report generation with asynchronous processing,
pre-signed S3 download links, and email notifications.

---

## Architecture

```
POST /generate
    │
    ▼
ComplianceController
    │  validates DTO + date range
    ▼
ComplianceService.queueReport()
    │  creates ComplianceReport (status=QUEUED)
    │  enqueues ComplianceReportJob to Redis/BullMQ
    │  returns { reportId, status, estimatedRows, message }
    ▼
ComplianceReportProcessor                 ← async worker
    │  builds report (SQL → CSV/XLSX/PDF)
    │  uploads to S3 (tagged for 30-day lifecycle)
    │  updates ComplianceReport (status=COMPLETED, s3Key, rowCount, …)
    │  sends email with 7-day pre-signed download URL
    └─ on failure → status=FAILED + failure email
```

---

## File Structure

```
src/
├── main.ts
├── app.module.ts
├── auth/
│   ├── guards/jwt-auth.guard.ts
│   └── decorators/require-permissions.decorator.ts
├── compliance/
│   ├── compliance.module.ts
│   ├── controllers/
│   │   └── compliance.controller.ts
│   ├── dto/
│   │   ├── generate-compliance-report.dto.ts
│   │   └── pagination-query.dto.ts
│   ├── entities/
│   │   └── compliance-report.entity.ts
│   ├── enums/
│   │   └── compliance-report.enum.ts
│   ├── interfaces/
│   │   ├── compliance-report-job.interface.ts
│   │   └── transaction-report-row.interface.ts
│   ├── processors/
│   │   └── compliance-report.processor.ts
│   └── services/
│       ├── compliance.service.ts
│       ├── compliance-storage.service.ts
│       ├── compliance-email.service.ts
│       └── report-builder.service.ts
├── migrations/
│   └── 1700000000000-CreateComplianceReports.ts
infra/
└── s3-lifecycle.tf
test/
└── compliance.service.spec.ts
```

---

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Copy and fill in environment variables
cp .env.example .env

# 3. Run migrations
npm run migration:run

# 4. Start in development mode
npm run start:dev
```

---

## Endpoints

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| `POST` | `/api/v1/compliance/reports/generate` | `audit:read` | Queue report generation |
| `GET` | `/api/v1/compliance/reports` | `audit:read` | Paginated report list |
| `GET` | `/api/v1/compliance/reports/:id` | `audit:read` | Status + download link |

Swagger UI available at: `http://localhost:3000/api/docs`

---

## Transaction Report CSV Field Order (AML/CFT)

Fields are written in this exact order per regulatory requirement:

```
reportDate, transactionId, merchantId, merchantName, merchantCountry,
chain, txHash, blockNumber, fromAddress, toAddress, tokenSymbol,
tokenAmount, usdAmount, exchangeRate, platformFeeUsd, networkFeeUsd,
merchantPayoutUsd, status, confirmedAt, settledAt, settlementId,
bankTransferRef, riskFlags
```

---

## Date Range Limits

| Report Type | Max Range |
|-------------|-----------|
| `TRANSACTION_REPORT` | 365 days (1 year) |
| `MERCHANT_DUE_DILIGENCE` | 90 days (3 months) |
| `AML_SUMMARY` | 90 days |
| `FEE_REPORT` | 90 days |
| `SETTLEMENT_REPORT` | 90 days |

---

## S3 Lifecycle

Reports are automatically deleted from S3 after **30 days** via an S3 lifecycle rule
scoped to objects tagged `Category=compliance-report`.

See `infra/s3-lifecycle.tf` for the Terraform resource or the equivalent AWS CLI command.

Pre-signed download URLs expire after **7 days**.

---

## Key Design Decisions

- **Never blocks on generation** — the POST endpoint returns immediately (HTTP 202) with the job reference; all heavy work runs in the BullMQ worker.
- **Retry logic** — jobs retry up to 3 times with exponential back-off (5 s, 10 s, 20 s).
- **Audit trail** — every `ComplianceReport` record stores the requesting admin's `id` and `email`.
- **Failure emails** — the processor catches all errors, marks the record as `FAILED`, and emails the requester.
- **CSV field order** — enforced via `TRANSACTION_REPORT_HEADERS` constant; no risk of column drift.
- **Format extensibility** — `ReportBuilderService` switches on `ReportFormat`; adding a new format requires only a new serialiser method.
