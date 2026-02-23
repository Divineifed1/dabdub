# Admin Controller - Administrative Operations

## Overview

The Admin Controller provides comprehensive administrative endpoints for platform administrators to manage merchants, monitor system health, handle support operations, and perform manual interventions when needed.

## Features

### ✅ Implemented Features

1. **Merchant Management**
   - List merchants with advanced filtering and search
   - Get detailed merchant information with stats
   - Update merchant status (suspend/activate)
   - Full audit logging for all merchant operations

2. **Payment Monitoring**
   - View all payments across merchants
   - Advanced filtering by status, merchant, date range, amount, currency
   - Search by reference or description
   - Pagination support

3. **Settlement Management**
   - Manual retry for failed settlements
   - Full audit trail for retry operations
   - Status validation before retry

4. **System Health & Monitoring**
   - Comprehensive health checks (database, Redis, blockchain, disk, memory)
   - Platform-wide metrics (merchants, payments, settlements)
   - Real-time system status

5. **Audit Logging**
   - Search and filter audit logs
   - Filter by entity type, actor, action, date range
   - Data classification support
   - Request ID tracking

6. **Manual Operations**
   - Manual reconciliation for payments and settlements
   - Adjustment amount support
   - Detailed notes and reason tracking
   - Full audit trail

## API Endpoints

### Merchant Management

#### `GET /api/v1/admin/merchants`
List all merchants with filtering and search.

**Query Parameters:**
- `page` (number): Page number (default: 1)
- `limit` (number): Items per page (default: 20)
- `status` (enum): Filter by merchant status
- `countryCode` (string): Filter by country (ISO 3166-1 alpha-2)
- `tier` (enum): Filter by merchant tier
- `businessType` (enum): Filter by business type
- `createdAfter` (date): Filter by creation date
- `createdBefore` (date): Filter by creation date
- `minVolumeUsd` (number): Minimum transaction volume
- `maxVolumeUsd` (number): Maximum transaction volume
- `search` (string): Search by business name, email, or registration number
- `sortBy` (string): Sort field
- `sortOrder` (string): ASC or DESC

**Response:**
```json
{
  "data": [...],
  "meta": {
    "total": 100,
    "page": 1,
    "limit": 20,
    "totalPages": 5
  },
  "summary": {
    "byStatus": {
      "active": 80,
      "suspended": 15,
      "pending": 5
    }
  }
}
```

#### `GET /api/v1/admin/merchants/:id`
Get detailed merchant information including stats.

**Response:**
```json
{
  "id": "uuid",
  "businessName": "Acme Corp",
  "email": "contact@acme.com",
  "status": "active",
  "stats": {
    "paymentCount": 150,
    "totalVolume": 50000.00
  }
}
```

#### `PUT /api/v1/admin/merchants/:id/status`
Update merchant status with audit logging.

**Request Body:**
```json
{
  "status": "suspended",
  "reason": "Suspicious activity detected"
}
```

### Payment Management

#### `GET /api/v1/admin/payments`
List all payments with advanced filtering.

**Query Parameters:**
- `page`, `limit`: Pagination
- `status`: Filter by payment status
- `merchantId`: Filter by merchant
- `reference`: Filter by reference
- `fromDate`, `toDate`: Date range filter
- `minAmount`, `maxAmount`: Amount range filter
- `currency`: Filter by currency
- `search`: Search by reference or description

### Settlement Management

#### `POST /api/v1/admin/settlements/:id/retry`
Manually retry a failed settlement.

**Requirements:**
- Settlement must be in FAILED status
- Creates audit log entry
- Resets retry count to 0

### System Monitoring

#### `GET /api/v1/admin/system/health`
Comprehensive system health check.

**Response:**
```json
{
  "status": "ok",
  "info": {
    "database": { "status": "up" },
    "redis": { "status": "up" },
    "blockchain_rpc": { "status": "up" },
    "memory_heap": { "status": "up" },
    "memory_rss": { "status": "up" },
    "storage": { "status": "up" }
  },
  "details": {...}
}
```

#### `GET /api/v1/admin/system/metrics`
Platform-wide metrics and statistics.

**Response:**
```json
{
  "merchants": {
    "total": 100,
    "active": 85
  },
  "payments": {
    "total": 5000,
    "volume": 1500000.00
  },
  "settlements": {
    "total": 4500,
    "pending": 50
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### Audit Logs

#### `GET /api/v1/admin/audit-logs`
Search and filter audit logs.

**Query Parameters:**
- `page`, `limit`: Pagination
- `entityType`: Filter by entity type
- `entityId`: Filter by entity ID
- `actorId`: Filter by actor ID
- `action`: Filter by action type
- `actorType`: Filter by actor type
- `dataClassification`: Filter by data classification
- `requestId`: Filter by request ID
- `startDate`, `endDate`: Date range filter

### Manual Operations

#### `POST /api/v1/admin/manual-reconciliation`
Perform manual reconciliation.

**Request Body:**
```json
{
  "type": "payment",
  "entityId": "uuid",
  "reason": "Manual adjustment required",
  "adjustmentAmount": 10.50,
  "notes": "Customer dispute resolved"
}
```

**Supported Types:**
- `payment`: Reconcile payment
- `settlement`: Reconcile settlement
- `refund`: Reconcile refund

## Security

### Authentication & Authorization

All admin endpoints are protected by:
1. **AdminJwtGuard**: Validates JWT token
2. **Admin Role Check**: Ensures user has ADMIN role
3. **Audit Logging**: All admin actions are logged

### Audit Trail

Every admin action creates an audit log entry with:
- Entity type and ID
- Action performed
- Actor ID and type
- Before/after state
- IP address
- User agent
- Request ID
- Metadata (reason, notes, etc.)

### Sensitive Data

- Sensitive fields are automatically masked in audit logs
- PII is redacted according to data classification
- Audit logs have configurable retention periods

## Testing

### Integration Tests

Comprehensive e2e tests are provided in `backend/test/admin.e2e-spec.ts`:

```bash
npm run test:e2e -- admin.e2e-spec
```

**Test Coverage:**
- ✅ Merchant listing with filters
- ✅ Merchant details retrieval
- ✅ Merchant status updates
- ✅ Payment listing with filters
- ✅ Settlement retry
- ✅ System health checks
- ✅ System metrics
- ✅ Audit log retrieval
- ✅ Manual reconciliation
- ✅ Authorization checks

### Manual Testing

Use the provided Swagger documentation at `/api/docs` (admin-only section).

## Usage Examples

### List Active Merchants

```bash
curl -X GET "http://localhost:3000/api/v1/admin/merchants?status=active&page=1&limit=20" \
  -H "Authorization: Bearer <admin-token>"
```

### Suspend a Merchant

```bash
curl -X PUT "http://localhost:3000/api/v1/admin/merchants/{id}/status" \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "suspended",
    "reason": "Compliance review required"
  }'
```

### Retry Failed Settlement

```bash
curl -X POST "http://localhost:3000/api/v1/admin/settlements/{id}/retry" \
  -H "Authorization: Bearer <admin-token>"
```

### Get System Health

```bash
curl -X GET "http://localhost:3000/api/v1/admin/system/health" \
  -H "Authorization: Bearer <admin-token>"
```

### Search Audit Logs

```bash
curl -X GET "http://localhost:3000/api/v1/admin/audit-logs?entityType=Merchant&action=update" \
  -H "Authorization: Bearer <admin-token>"
```

### Manual Reconciliation

```bash
curl -X POST "http://localhost:3000/api/v1/admin/manual-reconciliation" \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "payment",
    "entityId": "payment-uuid",
    "reason": "Customer dispute resolved",
    "adjustmentAmount": 10.50,
    "notes": "Refunded processing fee"
  }'
```

## Architecture

### Module Structure

```
backend/src/admin/
├── admin.controller.ts       # Main admin controller
├── admin.service.ts          # Admin business logic
├── admin.module.ts           # Module definition
├── dto/                      # Data transfer objects
│   ├── admin-payment-filters.dto.ts
│   ├── audit-log-filters.dto.ts
│   ├── manual-reconciliation.dto.ts
│   └── merchant-status-update.dto.ts
├── merchants/                # Merchant-specific admin endpoints
│   ├── merchants.controller.ts
│   ├── merchants.service.ts
│   ├── merchants.module.ts
│   └── dto/
└── README.md                 # This file
```

### Dependencies

- **TypeORM**: Database operations
- **NestJS**: Framework
- **Audit Module**: Audit logging
- **Health Module**: System health checks
- **Auth Module**: Authentication & authorization

## Performance Considerations

1. **Caching**: Merchant list queries are cached for 30 seconds
2. **Pagination**: All list endpoints support pagination
3. **Indexing**: Database indexes on frequently queried fields
4. **Query Optimization**: Efficient SQL queries with proper joins

## Monitoring

### Metrics to Monitor

- Admin action frequency
- Failed settlement retry success rate
- System health check results
- Audit log volume
- Response times for admin endpoints

### Alerts

Consider setting up alerts for:
- High number of merchant suspensions
- Frequent manual reconciliations
- System health check failures
- Unusual admin activity patterns

## Future Enhancements

Potential improvements:
- [ ] Bulk merchant operations
- [ ] Advanced analytics dashboard
- [ ] Export functionality for reports
- [ ] Real-time notifications for critical events
- [ ] Role-based access control (RBAC) for different admin levels
- [ ] Scheduled reports
- [ ] Merchant communication tools

## Support

For issues or questions:
1. Check the Swagger documentation at `/api/docs`
2. Review audit logs for debugging
3. Check system health endpoint for infrastructure issues
4. Contact the development team

## Changelog

### v1.0.0 (2024-01-01)
- Initial implementation
- Merchant management endpoints
- Payment monitoring
- Settlement retry
- System health checks
- Audit logging
- Manual reconciliation
- Comprehensive test coverage
