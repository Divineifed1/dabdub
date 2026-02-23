export interface ErrorResponse {
  statusCode: number;
  error: string; // HTTP status text (e.g., "Bad Request")
  message: string; // Human-readable message
  details?: unknown; // Validation errors or additional context
  requestId: string; // Correlation ID from AsyncLocalStorage
  timestamp: string; // ISO 8601
  path: string; // Request URL
}
