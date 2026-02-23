/**
 * Extracts a human-readable resource type and optional resource ID
 * from an API path. Used by the access-log middleware.
 *
 * Examples:
 *   /api/v1/merchants/abc-123          → { resourceType: 'Merchant', resourceId: 'abc-123' }
 *   /api/v1/feature-flags              → { resourceType: 'FeatureFlag', resourceId: null }
 *   /api/v1/transactions/uuid/refund   → { resourceType: 'Transaction', resourceId: 'uuid' }
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SEGMENT_TO_TYPE: Record<string, string> = {
  merchants: 'Merchant',
  transactions: 'Transaction',
  settlements: 'Settlement',
  'api-keys': 'ApiKey',
  users: 'AdminUser',
  'feature-flags': 'FeatureFlag',
  webhooks: 'Webhook',
  'payment-requests': 'PaymentRequest',
  kyc: 'Kyc',
  alerts: 'Alert',
  analytics: 'Analytics',
  treasury: 'Treasury',
  'access-log': 'AccessLog',
  sessions: 'Session',
  'admin-activity-report': 'ActivityReport',
};

export function extractResource(path: string): {
  resourceType: string;
  resourceId: string | null;
} {
  // Strip query string
  const cleanPath = path.split('?')[0];
  // Remove common API prefixes
  const normalised = cleanPath
    .replace(/^\/api\/v\d+\//, '')
    .replace(/^admin\//, '');

  const segments = normalised.split('/').filter(Boolean);

  let resourceType = 'Unknown';
  let resourceId: string | null = null;

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];

    if (SEGMENT_TO_TYPE[seg]) {
      resourceType = SEGMENT_TO_TYPE[seg];
      // Check if the next segment is an ID (UUID or other alphanumeric id)
      const next = segments[i + 1];
      if (next && (UUID_RE.test(next) || /^[a-z][a-z0-9_-]{2,}$/.test(next))) {
        resourceId = next;
      }
      break; // first matched segment wins
    }

    // If segment looks like a UUID it's probably a bare resource id
    if (UUID_RE.test(seg) && i > 0) {
      resourceId = seg;
    }
  }

  return { resourceType, resourceId };
}
