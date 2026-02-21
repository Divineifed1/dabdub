# 2FA Flow Examples

## Example 1: Setting up 2FA for an Admin

### Step 1: Initiate Setup
```bash
curl -X POST http://localhost:4000/api/v1/auth/2fa/setup \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json"
```

**Response:**
```json
{
  "secret": "JBSWY3DPEHPK3PXP",
  "qrCode": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...",
  "qrUri": "otpauth://totp/Cheese%20Admin:admin@cheese.io?secret=JBSWY3DPEHPK3PXP&issuer=Cheese%20Admin",
  "expiresInSeconds": 600
}
```

### Step 2: Scan QR Code
- Open Google Authenticator, Authy, or 1Password
- Scan the QR code from the response
- The app will start generating 6-digit codes

### Step 3: Verify and Enable
```bash
curl -X POST http://localhost:4000/api/v1/auth/2fa/verify-setup \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "totpCode": "123456"
  }'
```

**Response:**
```json
{
  "enabled": true,
  "backupCodes": [
    "A1B2-C3D4-E5F6",
    "G7H8-I9J0-K1L2",
    "M3N4-O5P6-Q7R8",
    "S9T0-U1V2-W3X4",
    "Y5Z6-A7B8-C9D0",
    "E1F2-G3H4-I5J6",
    "K7L8-M9N0-O1P2",
    "Q3R4-S5T6-U7V8",
    "W9X0-Y1Z2-A3B4",
    "C5D6-E7F8-G9H0"
  ]
}
```

**Important:** Save these backup codes securely! They will not be shown again.

---

## Example 2: Login with 2FA Enabled

### Step 1: Initial Login
```bash
curl -X POST http://localhost:4000/api/v1/admin/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@cheese.io",
    "password": "SecurePassword123!"
  }'
```

**Response (2FA Required):**
```json
{
  "requires2FA": true,
  "twoFactorToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhZG1pbi0xMjMiLCJ0eXBlIjoiMmZhX3BlbmRpbmciLCJzZXNzaW9uSWQiOiJzZXNzaW9uLTEyMyIsImlhdCI6MTcwODgwMDAwMCwiZXhwIjoxNzA4ODAwMzAwfQ.signature",
  "message": "Please provide your 2FA code to complete login"
}
```

### Step 2: Validate 2FA Code
```bash
curl -X POST http://localhost:4000/api/v1/auth/2fa/validate \
  -H "Content-Type: application/json" \
  -d '{
    "twoFactorToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "totpCode": "123456"
  }'
```

**Response (Success):**
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

---

## Example 3: Using a Backup Code

If you don't have access to your TOTP app, use a backup code:

```bash
curl -X POST http://localhost:4000/api/v1/auth/2fa/validate \
  -H "Content-Type: application/json" \
  -d '{
    "twoFactorToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "backupCode": "A1B2-C3D4-E5F6"
  }'
```

**Note:** Each backup code can only be used once. After use, it's removed from your account.

---

## Example 4: Regenerating Backup Codes

If you've used several backup codes or want fresh ones:

```bash
curl -X POST http://localhost:4000/api/v1/auth/2fa/regenerate-backup-codes \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "totpCode": "123456"
  }'
```

**Response:**
```json
{
  "backupCodes": [
    "X1Y2-Z3A4-B5C6",
    "D7E8-F9G0-H1I2",
    "J3K4-L5M6-N7O8",
    "P9Q0-R1S2-T3U4",
    "V5W6-X7Y8-Z9A0",
    "B1C2-D3E4-F5G6",
    "H7I8-J9K0-L1M2",
    "N3O4-P5Q6-R7S8",
    "T9U0-V1W2-X3Y4",
    "Z5A6-B7C8-D9E0"
  ]
}
```

---

## Example 5: Disabling 2FA (Non-Mandatory Roles Only)

```bash
curl -X POST http://localhost:4000/api/v1/auth/2fa/disable \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "totpCode": "123456",
    "password": "SecurePassword123!"
  }'
```

**Response:** 204 No Content (Success)

**Note:** This will fail with 403 Forbidden for SUPER_ADMIN and FINANCE_ADMIN roles.

---

## Error Scenarios

### Invalid TOTP Code
```json
{
  "statusCode": 400,
  "message": "Invalid TOTP code",
  "error": "Bad Request"
}
```

### Too Many Failed Attempts
```json
{
  "statusCode": 403,
  "message": "2FA validation locked due to too many failed attempts. Try again in 15 minutes.",
  "error": "Forbidden"
}
```

### 2FA Already Enabled
```json
{
  "statusCode": 409,
  "message": "2FA is already enabled for this account",
  "error": "Conflict"
}
```

### Setup Expired
```json
{
  "statusCode": 400,
  "message": "Setup expired or not found. Please restart 2FA setup.",
  "error": "Bad Request"
}
```

### Mandatory 2FA Cannot Be Disabled
```json
{
  "statusCode": 403,
  "message": "2FA is mandatory for SUPER_ADMIN and FINANCE_ADMIN roles",
  "error": "Forbidden"
}
```

---

## Testing with Different TOTP Apps

### Google Authenticator
1. Open the app
2. Tap "+" or "Add account"
3. Choose "Scan QR code"
4. Scan the QR code from the setup response

### Authy
1. Open the app
2. Tap "Add Account"
3. Choose "Scan QR Code"
4. Scan the QR code from the setup response

### 1Password
1. Open 1Password
2. Create a new Login item
3. Click "Add more" → "One-Time Password"
4. Scan the QR code or paste the `qrUri` value

### Manual Entry (Any App)
If you can't scan the QR code:
1. Choose "Enter a setup key" or "Manual entry"
2. Enter the `secret` value from the setup response
3. Choose "Time-based" and "6 digits"

---

## Time Synchronization

TOTP codes are time-sensitive. Ensure:
- Server time is synchronized (use NTP)
- Your device time is accurate
- Codes are valid for ±30 seconds (±1 step)

If codes consistently fail, check time synchronization on both server and client.
