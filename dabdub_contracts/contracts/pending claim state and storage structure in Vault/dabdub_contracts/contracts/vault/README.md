# Vault Contract - Pending Claim Implementation

## Overview

This implementation adds a "pending claim" state to the Vault contract, allowing payments to be held in escrow until claimed by beneficiaries or expired.

## Features

### PendingClaim Structure

The `PendingClaim` struct tracks all necessary information for a payment awaiting claim:

```rust
pub struct PendingClaim {
    pub user_wallet: Address,      // The wallet that initiated the payment
    pub payment_amount: i128,       // Amount to be paid to recipient
    pub fee_amount: i128,           // Fee amount for the transaction
    pub recipient: Address,         // Beneficiary address
    pub expiry_ledger: u32,         // Ledger number when claim expires
    pub payment_id: BytesN<32>,     // Unique payment identifier
}
```

### Storage Keys

- `DataKey::PendingClaim(BytesN<32>)` - Stores individual pending claims by payment ID
- `DataKey::AllPendingClaims` - Maintains an index of all pending claim IDs

### Functions

#### `process_payment`

Creates a new pending claim instead of immediately processing the payment.

**Parameters:**

- `user_wallet`: Address initiating the payment (requires auth)
- `payment_amount`: Amount to be paid
- `fee_amount`: Transaction fee
- `recipient`: Beneficiary address
- `claim_period_ledgers`: Number of ledgers until expiry
- `payment_id`: Unique identifier for the payment

#### `get_pending_claim`

Retrieves a pending claim by its payment ID.

#### `get_all_pending_claims`

Returns all pending claim IDs currently in storage.

## Testing

The implementation includes comprehensive unit tests:

1. **test_create_pending_claim** - Verifies basic pending claim creation
2. **test_multiple_pending_claims** - Tests multiple simultaneous pending claims
3. **test_pending_claim_expiry** - Validates expiry ledger calculation

### Running Tests

```bash
cargo test --manifest-path dabdub_contracts/contracts/vault/Cargo.toml
```

### Prerequisites

- Rust toolchain (install from https://rustup.rs/)
- Soroban SDK dependencies

## Implementation Notes

- Uses persistent storage for pending claims to survive contract upgrades
- Requires authentication from the user wallet initiating the payment
- Supports multiple pending claims simultaneously through indexed storage
- Expiry is calculated based on current ledger sequence + claim period

## Next Steps

Future enhancements may include:

- Claim execution function for beneficiaries
- Expiry handling and refund mechanism
- Claim cancellation by original payer
- Events emission for claim lifecycle
