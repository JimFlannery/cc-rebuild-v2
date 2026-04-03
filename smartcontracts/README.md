# ConditionCover — Smart Contracts

Solana on-chain program built with the [Anchor](https://www.anchor-lang.com) framework. Holds user collateral in escrow, enforces oracle authority, and transfers funds to the winning party when a space weather contract is settled. Also supports delta-neutral Yield Boost looping via a treasury loan mechanism.

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

### Core Contract Instructions

| Instruction | Signer | Status | Description |
|---|---|---|---|
| `create_order` | User wallet | ✓ Implemented | Creates Hedge or Cover order; locks collateral into PDA escrow |
| `match_order` | Matcher (any) | ✓ Implemented | Pairs a Hedge + Cover order; transfers premium to cover party; coverage → contract escrow |
| `cancel_order` | Order owner | ✓ Implemented | Cancels Open order; returns escrowed collateral; closes Order + escrow accounts |
| `settle` | Oracle wallet | ✓ Implemented | Records outcome on Contract account; transfers collateral to winner |

### Yield Boost / Looping Instructions

| Instruction | Signer | Status | Description |
|---|---|---|---|
| `init_treasury` | Admin | ✓ Implemented | One-time setup of the Treasury PDA; funded by admin keypair |
| `fund_treasury` | Admin | ✓ Implemented | Deposits SSTM into the Treasury token account for loan issuance |
| `create_loop_set` | Matcher | ✓ Implemented | Validates 4 seed orders (2 hedge + 2 cover); creates LoopSet PDA; pre-calculates loan totals and interest |
| `issue_loop_loan` | Permissionless | ✓ Implemented | Issues equal SSTM loans from Treasury to both users; enforces strict sequence |
| `register_loop_contract` | Permissionless | ✓ Implemented | Links a Contract PDA into the LoopSet registry; auto-transitions Pending → Active when initial pair is complete |
| `settle_loop_set` | Oracle + user1 + user2 | ✓ Implemented | Oracle and both users co-sign; collects interest from users; marks LoopSet Settled |

---

## Account Structures

### `Order` — `src/state/order.rs` ✓
Hedge or Cover order with collateral locked in a paired escrow PDA. Seeds: `["order", owner, nonce_le8]`. Escrow seeds: `["escrow", order_pda]`.

### `Contract` — `src/state/contract.rs` ✓
Matched contract pairing one Hedge + one Cover order. Created by `match_order`; settled by `settle`. Seeds: `["contract", hedge_order, cover_order]`.

| Field | Type | Description |
|---|---|---|
| `hedge_order` | `Pubkey` | Pubkey of the hedge Order account |
| `cover_order` | `Pubkey` | Pubkey of the cover Order account |
| `hedge_token_account` | `Pubkey` | Token destination if hedge party wins (`outcome=1`) |
| `cover_token_account` | `Pubkey` | Token destination if cover party wins (`outcome=0`) |
| `expiration` | `i64` | Unix timestamp after which contract expires |
| `outcome` | `Option<u8>` | `None` = unsettled; `Some(1)` = hedge wins; `Some(0)` = cover wins |
| `bump` | `u8` | PDA bump seed |

### `LoopSet` — `src/state/loop_set.rs` ✓
Registry for a delta-neutral loop pairing two users across multiple contract pairs. Seeds: `["loop_set", user1, user2, seed_order]`. Stores up to 22 contract PDAs (11 pairs × 2). Size: 861 bytes.

| Field | Type | Description |
|---|---|---|
| `user1` / `user2` | `Pubkey` | The two looping parties |
| `num_loops` | `u8` | Total loops in this set |
| `loan_amount_per_user` | `u64` | SSTM loaned to each user (token units) |
| `interest_rate_bps` | `u16` | Annual interest rate in basis points |
| `contracts` | `[Pubkey; 22]` | All Contract PDAs in this set |
| `contract_count` | `u8` | Number of contracts registered so far |
| `status` | `LoopSetStatus` | `Pending → Active → Settled` |
| `loan_issued` | `bool` | Whether `issue_loop_loan` has been called |

### `Treasury` — `src/state/treasury.rs` ✓
Admin-controlled SSTM reserve for funding loop loans. Seeds: `["treasury"]`. Size: 98 bytes.

| Field | Type | Description |
|---|---|---|
| `admin` | `Pubkey` | Authority that can fund the treasury |
| `total_deposited` | `u64` | Cumulative SSTM deposited |
| `total_loaned` | `u64` | Cumulative SSTM loaned out |
| `total_repaid` | `u64` | Cumulative SSTM repaid |
| `bump` | `u8` | PDA bump seed |

---

## Errors — `src/errors.rs`

### Core Errors

| Code | Name | Message |
|---|---|---|
| 6000 | `UnauthorizedOracle` | Signer is not the authorized oracle |
| 6001 | `AlreadySettled` | Contract has already been settled |
| 6002 | `InvalidOutcome` | Invalid outcome — must be 0 (cover wins) or 1 (hedge wins) |
| 6003 | `OrderNotOpen` | Order is not in Open status |
| 6004 | `OrderTypeMismatch` | Expected Hedge but got Cover, or vice versa |
| 6005 | `DenominationMismatch` | Hedge and Cover orders use different token denominations |
| 6006 | `IndexMismatch` | Hedge and Cover orders specify different index conditions |
| 6007 | `Unauthorized` | Signer is not the order owner |
| 6008 | `OrderAlreadyMatched` | Order has already been matched |

### Yield Boost / Loop Errors

| Code | Name | Message |
|---|---|---|
| 6009 | `LoopSetNotPending` | LoopSet is not in Pending status |
| 6010 | `LoopSetNotActive` | LoopSet is not in Active status |
| 6011 | `LoopSetFull` | LoopSet has reached maximum contract count |
| 6012 | `LoanAlreadyIssued` | Loop loan has already been issued for this LoopSet |
| 6013 | `InsufficientTreasuryBalance` | Treasury does not have enough SSTM for this loan |
| 6014 | `InvalidLoopOrder` | Order is not marked as a loop order |
| 6015 | `LoopOrderUserMismatch` | Loop order does not belong to the expected user |
| 6016 | `InvalidAdminAuthority` | Signer is not the admin authority |
| 6017 | `ContractAlreadyRegistered` | Contract PDA already exists in this LoopSet |

---

## Structure

```
programs/condition_cover/src/
├── lib.rs                          ← entry point; all modules and instructions declared
├── constants.rs                    ← ORACLE_AUTHORITY + ADMIN_AUTHORITY pubkeys
├── errors.rs                       ← custom error codes (6000–6017)
├── instructions/
│   ├── mod.rs
│   ├── create_order.rs             ✓ locks collateral into PDA escrow
│   ├── match_order.rs              ✓ pairs orders, creates Contract account
│   ├── cancel_order.rs             ✓ releases escrow, closes Order account
│   ├── settle.rs                   ✓ oracle settles; transfers to winner
│   ├── init_treasury.rs            ✓ one-time Treasury PDA setup
│   ├── fund_treasury.rs            ✓ admin SSTM deposit
│   ├── create_loop_set.rs          ✓ validates seed orders, creates LoopSet
│   ├── issue_loop_loan.rs          ✓ Treasury → user1 + user2 SSTM loans
│   ├── register_loop_contract.rs   ✓ links Contract into LoopSet
│   └── settle_loop_set.rs          ✓ oracle + users co-sign; collects interest
└── state/
    ├── mod.rs
    ├── order.rs                    ✓ Order account
    ├── contract.rs                 ✓ Contract account
    ├── loop_set.rs                 ✓ LoopSet account (861 bytes)
    └── treasury.rs                 ✓ Treasury account (98 bytes)
```

---

## Integration Tests — `tests/`

**24 tests passing** on localnet. Last verified: 2026-04-02.

> Run in WSL2: `anchor test`
> Anchor.toml includes `[test] startup_wait = 10000` to allow local validator to fully start.

### Core tests — `tests/condition_cover.ts` (8 tests)

| # | Test | What it verifies |
|---|---|---|
| 1 | Hedge order creation | Order PDA + escrow created; `hedge_premium` locked; `order_type = Hedge`, `status = Open` |
| 2 | Cover order creation | Order PDA + escrow created; `coverage` locked; `order_type = Cover`, `status = Open` |
| 3 | Match hedge + cover | Contract PDA created; premium → cover wallet; coverage → contract escrow; both orders `Matched` |
| 4 | Settle — hedge wins | Escrow → hedge token account; `outcome = 1` |
| 5 | Settle — cover wins | Escrow → cover token account; `outcome = 0` |
| 6 | Double-settle rejected | `AlreadySettled` (6001) |
| 7 | Cancel open order | Collateral returned; Order account closed (rent reclaimed) |
| 8 | Non-owner cancel rejected | `Unauthorized` (6007) |

### Yield Boost tests — `tests/yield_boost.ts` (16 tests)

| # | Test | What it verifies |
|---|---|---|
| 1 | `init_treasury` | Treasury PDA created with correct admin |
| 2 | `fund_treasury` | Treasury token account balance increases by deposit amount |
| 3 | Seed 4 loop orders (2 hedge + 2 cover) | 4 Orders created, all `IsLoopOrder = true` |
| 4 | `create_loop_set` — valid | LoopSet PDA created; `status = Pending`; loan amounts pre-calculated |
| 5 | `create_loop_set` — invalid orders rejected | Non-loop orders rejected |
| 6 | Match initial contracts A+B | 2 Contracts created; premiums transferred |
| 7 | `register_loop_contract` — first contract | Contract A linked; `contract_count = 1` |
| 8 | `register_loop_contract` — second contract | Contract B linked; `contract_count = 2`; `status → Active` |
| 9 | `issue_loop_loan` — successful | User1 + User2 each receive loan; `loan_issued = true` |
| 10 | `issue_loop_loan` — rejected if already issued | `LoanAlreadyIssued` (6012) |
| 11 | Create loop 1 orders (2 hedge + 2 cover) | 4 additional loop Orders created |
| 12 | Match loop 1 contracts C+D | 2 more Contracts created |
| 13 | Register loop 1 contracts C+D | `contract_count = 4` |
| 14 | Settle all 4 contracts | All contracts settled via `settle` instruction |
| 15 | `settle_loop_set` — successful | Interest collected from both users; `status → Settled` |
| 16 | `settle_loop_set` — rejected if not all settled | `LoopSetNotActive` (6010) |

---

## Oracle Authority

Only the wallet hardcoded in `src/constants.rs` as `ORACLE_AUTHORITY` may call `settle` and co-sign `settle_loop_set`. Any other signer is rejected with `UnauthorizedOracle`.

```rust
pub const ORACLE_AUTHORITY: Pubkey = pubkey!("Dtp4xjj7S56J7FFLPm5TFqA8kd3FDfNdkgAabB4cuckx");
```

The off-chain oracle service (`oracle/`) signs settlement transactions with this keypair.

> **TODO (pre-devnet):** Generate a dedicated `ADMIN_AUTHORITY` keypair for treasury operations (`init_treasury`, `fund_treasury`). Currently uses the same constant as a placeholder — replace before private devnet deployment.

---

## Tokens

| Token | Role |
|---|---|
| USDC | Primary stablecoin denomination for coverage and premiums |
| SSTM | ConditionCover platform token — Yield Boost loans and rewards |
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

Ensure PATH includes Cargo and Solana bins before running:

```bash
export PATH="/home/jimf/.cargo/bin:/home/jimf/.local/share/solana/install/active_release/bin:$PATH"
```

### Build & Test

```bash
# Build the program
anchor build

# Run all integration tests against local validator (24 tests)
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

## Pending Items

| Item | Notes |
|---|---|
| Generate dedicated `ADMIN_AUTHORITY` keypair | Replace placeholder in `constants.rs` before private devnet |
| `cancel_loop_set` instruction | Edge case: cancel a LoopSet before all contracts are registered |
| Deploy to private devnet | Currently local validator only |
| Optimistic oracle dispute window | Post-devnet: replace single-step `settle` with `propose` → dispute window → `finalize` |

---

## Future: Optimistic Oracle (post-devnet)

After devnet, the single-step `settle` instruction will be replaced with an **optimistic oracle** pattern allowing a dispute window before funds are released.

**Planned instruction set:**

| Instruction | Signer | Description |
|---|---|---|
| `propose` | Oracle wallet | Sets `proposed_outcome` + `dispute_deadline` on Contract account |
| `dispute` | Any wallet | Raises a challenge during the dispute window |
| `finalize` | Oracle wallet | Releases funds after window closes with no challenge |

**Do not implement during devnet.** The current `settle` instruction is the correct approach for development and testing.

---

Copyright (c) 2026 Frontier Stream Inc. All Rights Reserved. Patent Pending (US20250245751A1, PCT/US2025/012697).
