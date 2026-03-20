# ConditionCover — Smart Contracts

Solana on-chain program built with the [Anchor](https://www.anchor-lang.com) framework. Holds user collateral in escrow, enforces oracle authority, and transfers funds to the winning party when a space weather contract is settled.

---

## Program

| Property | Value |
|---|---|
| Program ID | `5PkPCbdZNFGYVJNjifxgZDGyeaMKmTeWPj4fxhYeeB9K` |
| Framework | Anchor 0.32 |
| Language | Rust 1.94.0 |
| Network | Solana devnet (development) |

---

## Instructions

| Instruction | Signer | Status | Description |
|---|---|---|---|
| `settle` | Oracle wallet | ✓ Implemented | Records outcome on Contract account; transfers collateral to winner |
| `create_order` | User wallet | Planned | Creates Hedge or Cover order; locks collateral in PDA escrow |
| `match_order` | Any | Planned | Pairs a Hedge + Cover order; creates live Contract account |
| `cancel_order` | User wallet | Planned | Cancels unfilled order; releases escrowed tokens |

---

## Structure

```
programs/condition_cover/src/
├── lib.rs              ← program entry point; declares all modules and instructions
├── constants.rs        ← ORACLE_AUTHORITY pubkey (hardcoded)
├── errors.rs           ← custom error codes
├── instructions/
│   ├── mod.rs
│   └── settle.rs       ← oracle-signed settlement instruction
└── state/
    ├── mod.rs
    └── contract.rs     ← Contract on-chain account struct
```

---

## Oracle Authority

Only the wallet hardcoded in `src/constants.rs` as `ORACLE_AUTHORITY` may call `settle`. Any other signer is rejected with `UnauthorizedOracle`.

```rust
pub const ORACLE_AUTHORITY: Pubkey = pubkey!("Dtp4xjj7S56J7FFLPm5TFqA8kd3FDfNdkgAabB4cuckx");
```

The off-chain oracle service (`oracle/`) signs settlement transactions with this keypair.

---

## Tokens

| Token | Role |
|---|---|
| USDC | Primary stablecoin denomination for coverage and premiums |
| SSTM | ConditionCover platform token (alternative denomination) |
| SOL | Layer 1 gas for all on-chain transactions |
| LINK | Oracle gas fee (reserved) |

---

## Development

> All Anchor / Rust development runs inside **WSL2 (Ubuntu 22.04)**. Do not build natively on Windows.

### Prerequisites

| Tool | Version | Install |
|---|---|---|
| Rust | 1.94.0 | `rustup` |
| Solana / Agave CLI | 3.1.11 | Agave installer |
| Anchor CLI | 0.32.1 | Built from source |
| Node.js | 20.x | `nvm` |
| Yarn | 1.22.x | `npm i -g yarn` |

WSL2 path: `/mnt/c/Users/jim-f/source/repos/cc-rebuild-v2/smartcontracts`

### Build & Test

```bash
# Build the program
anchor build

# Run integration tests against local validator
anchor test
```

### Deploy to Devnet

```bash
solana config set --url devnet
# Update Anchor.toml: cluster = "devnet"

anchor build
anchor deploy
```

Verify on [Solscan Devnet](https://solscan.io/?cluster=devnet).

> Smart contract deploys are always manual — there is no automated CI/CD for on-chain programs.

---

## Errors

| Code | Name | Message |
|---|---|---|
| 6000 | `UnauthorizedOracle` | Signer is not the authorized oracle |
| 6001 | `AlreadySettled` | Contract has already been settled |
| 6002 | `InvalidOutcome` | Invalid outcome — must be 0 (cover wins) or 1 (hedge wins) |

---

Copyright (c) 2026 Frontier Stream Inc. All Rights Reserved. Patent Pending (US20250245751A1, PCT/US2025/012697).
