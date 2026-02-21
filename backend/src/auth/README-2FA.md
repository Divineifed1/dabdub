# Admin 2FA Implementation

This document describes the Time-based One-Time Password (TOTP) 2FA implementation for admin users, following RFC 6238.

## Overview

- 2FA is **mandatory** for `SUPER_ADMIN` and `FINANCE_ADMIN` roles
- 2FA is **optional** for other admin roles (`ADMIN`, `SUPPORT_ADMIN`)
- Uses standard TOTP apps (Google Authenticator, Authy, 1Password, etc.)
- Provides backup codes for account recovery
- Implements rate limiting and lockout protection

## Security Features

### Encryption
- TOTP secrets are encrypted using **AES-256-GCM** before storage
- Encryption key is derived from `ENCRYPTION_KEY` environment variable
- Format: `iv:authTag:ciphertext` (all base64 encoded)

### Backup Codes
- 10 backup codes generated during setup
- Format: `XXXX-XXXX-XXXX` (12 hex characters)
- Stored as bcrypt hashes
- Each code can only be used once
- Can be regenerated with valid TOTP code

### Rate Limiting
- Maximum 5 failed 2FA attempts
- 15-minute lockout after exceeding limit
- Separate from login attempt tracking

## API Endpoints

### 1. POST `/api/v1/auth/2fa/setup`
**Initiate 2FA setup** (requires authentication)

**Response:**
```json
{
  "secret": "JBSWY3DPEHPK3PXP",
  "qrCode": "data:image/png;base64,...",
  "qrUri": "otpauth://totp/Cheese%20Admin:admin@cheese.io?secret=JBSWY3DPEHPK3PXP&issuer=Cheese%20Admin",
  "expiresInSeconds": 600
}
```

**Notes:**
- Secret stored temporarily in Redis (10-minute TTL)
- Returns 409 Conflict if 2FA already enabled
- QR code can be scanned by any TOTP app

### 2. POST `/api/v1/auth/2fa/verify-setup`
**Confirm and enable 2FA**

**Request:**
```json
{
  "totpCode": "123456"
}
```

**Response:**
```json
{
  "enabled": true,
  "backupCodes": [
    "ABCD-EFGH-IJKL",
    "MNOP-QRST-UVWX",
    "..."
  ]
}
```

**Notes:**
- Validates TOTP code against pending secret
- Encrypts and persists secret to database
- Generates and returns backup codes (shown only once)
- Invalidates all existing sessions

### 3. POST `/api/v1/auth/2fa/disable`
**Disable 2FA** (requires authentication)

**Request:**
```json
{
  "totpCode": "123456",
  "password": "admin-password"
}
```

**Notes:**
- Requires both TOTP code and password
- Returns 403 Forbidden for `SUPER_ADMIN` and `FINANCE_ADMIN`
- Clears all 2FA settings
- Invalidates all sessions

### 4. POST `/api/v1/auth/2fa/validate`
**Validate TOTP during login** (step 2 of login)

**Request:**
```json
{
  "twoFactorToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "totpCode": "123456"
}
```

**OR with backup code:**
```json
{
  "twoFactorToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "backupCode": "ABCD-EFGH-IJKL"
}
```

**Response:**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expires_in": 7200,
  "admin": {
    "id": "admin-123",
    "email": "admin@cheese.io",
    "role": "super_admin"
  }
}
```

**Notes:**
- `twoFactorToken` is a short-lived JWT (5 minutes) issued during login
- Accepts either TOTP code or backup code
- Used backup codes are removed from the list
- Locks account after 5 failed attempts for 15 minutes

### 5. POST `/api/v1/auth/2fa/regenerate-backup-codes`
**Regenerate backup codes** (requires authentication)

**Request:**
```json
{
  "totpCode": "123456"
}
```

**Response:**
```json
{
  "backupCodes": [
    "ABCD-EFGH-IJKL",
    "MNOP-QRST-UVWX",
    "..."
  ]
}
```

**Notes:**
- Requires valid TOTP code
- Invalidates all old backup codes
- Returns new codes (shown only once)

## Login Flow with 2FA

### Without 2FA Enabled
1. POST `/api/v1/admin/auth/login` with email/password
2. Receive access token and refresh token

### With 2FA Enabled
1. POST `/api/v1/admin/auth/login` with email/password
2. Receive response:
   ```json
   {
     "requires2FA": true,
     "twoFactorToken": "short-lived-jwt",
     "message": "Please provide your 2FA code to complete login"
   }
   ```
3. POST `/api/v1/auth/2fa/validate` with `twoFactorToken` and TOTP code
4. Receive full access token and refresh token

## TOTP Configuration

- **Algorithm:** SHA-1 (TOTP standard)
- **Period:** 30 seconds
- **Digits:** 6
- **Window:** ±1 step (±30 seconds tolerance)

## Environment Variables

```bash
# Required for 2FA encryption
ENCRYPTION_KEY=your-secure-encryption-key-here
```

Generate a secure key:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Audit Events

The following events are logged:
- `ADMIN_2FA_ENABLED` - When 2FA is successfully enabled
- `ADMIN_2FA_DISABLED` - When 2FA is disabled
- `ADMIN_2FA_VALIDATED` - Successful 2FA validation during login
- `ADMIN_2FA_FAILED` - Failed 2FA validation attempt
- `ADMIN_BACKUP_CODES_REGENERATED` - When backup codes are regenerated

## Testing

### Unit Tests
```bash
npm test -- crypto.service.spec.ts
npm test -- admin-two-factor.service.spec.ts
```

### Manual Testing with Google Authenticator
1. Call `/api/v1/auth/2fa/setup` endpoint
2. Scan QR code with Google Authenticator app
3. Use generated 6-digit code to call `/api/v1/auth/2fa/verify-setup`
4. Save backup codes securely
5. Test login flow with 2FA enabled

## Security Considerations

1. **Secret Storage:** TOTP secrets are never stored in plaintext
2. **Backup Codes:** Stored as bcrypt hashes, single-use only
3. **Rate Limiting:** Prevents brute-force attacks on TOTP codes
4. **Session Invalidation:** All sessions cleared when enabling/disabling 2FA
5. **Mandatory 2FA:** Cannot be disabled for sensitive roles
6. **Time Sync:** Ensure server time is synchronized (NTP recommended)

## Troubleshooting

### "Invalid TOTP code" errors
- Check server time synchronization
- Verify TOTP app time is correct
- Try codes within ±30 second window

### "Setup expired" errors
- Setup tokens expire after 10 minutes
- Restart setup process from beginning

### Account locked
- Wait 15 minutes after 5 failed attempts
- Use backup code if available
- Contact system administrator if locked out

## Dependencies

- `otplib` - TOTP generation and validation (RFC 6238)
- `qrcode` - QR code generation for easy setup
- `bcrypt` - Backup code hashing
- `crypto` (Node.js) - AES-256-GCM encryption
