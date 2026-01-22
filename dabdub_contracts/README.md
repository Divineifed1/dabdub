# Dabdub Stellar Contract

A stablecoin payment system on Stellar blockchain that allows users to fund accounts with USDC and pay bills in local currencies.

## Project Structure
```
cheese-vault-stellar/
├── Cargo.toml                    # Workspace manifest
├── contracts/
│   ├── vault/                    # Main vault contract
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── lib.rs
│   │       └── token_helpers.rs  # USDC token integration helpers
│   ├── user_wallet/              # Individual user wallet contract
│   │   ├── Cargo.toml
│   │   └── src/
│   │       └── lib.rs
│   └── wallet_factory/           # Factory for deploying user wallets
│       ├── Cargo.toml
│       └── src/
│           └── lib.rs
└── README.md
```

## Setup

### Prerequisites

- [Rust](https://www.rust-lang.org/tools/install)
- [Stellar CLI](https://developers.stellar.org/docs/tools/developer-tools)

### Installation
```bash
# Clone the repository
git clone https://github.com/songifi/dabdub.git
cd dabdub_contracts

# Build all contracts
cargo build

```

## Testing

### Run All Tests
```bash
cargo test
```