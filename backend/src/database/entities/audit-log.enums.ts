export enum AuditAction {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  VIEW = 'view',
  EXPORT = 'export',
  SANDBOX_RESET = 'sandbox_reset',
  EXCHANGE_RATE_OVERRIDE_SET = 'exchange_rate_override_set',
  FEATURE_FLAG_CREATED = 'feature_flag_created',
  FEATURE_FLAG_UPDATED = 'feature_flag_updated',
  FEATURE_FLAG_OVERRIDE_SET = 'feature_flag_override_set',
  FEATURE_FLAG_OVERRIDE_REMOVED = 'feature_flag_override_removed',
  ADMIN_SESSION_FORCE_TERMINATED = 'admin_session_force_terminated',
}

export enum ActorType {
  USER = 'user',
  ADMIN = 'admin',
  SYSTEM = 'system',
  API_KEY = 'api_key',
  SERVICE_ACCOUNT = 'service_account',
}

export enum DataClassification {
  SENSITIVE = 'sensitive',
  NORMAL = 'normal',
  PUBLIC = 'public',
}
