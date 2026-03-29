# ConditionCover — Smart Contracts (Solana / Anchor)

## Stack

- **Rust 1.94.0** — on-chain program language
- **Anchor 0.32.0** — Solana smart contract framework (built from source; AVM prebuilt incompatible with Ubuntu 22.04 GLIBC 2.35)
- **anchor-spl** — SPL token CPI helpers (USDC, SSTM transfers) — to be added
- **chainlink_solana** (SDK v2) — Chainlink Data Feed account reads — to be added when price feeds are needed
- **TypeScript + Mocha** — integration tests via Anchor's test runner
- **Solana CLI** — deployment and wallet management

---

## Workspace Structure

Anchor workspace is rooted at `smartcontracts/` (flattened — no nested subdirectory).

```
smartcontracts/
├── CLAUDE.md               ← this file
├── Anchor.toml             ← cluster, wallet path, program IDs, test script
├── Cargo.toml              ← Rust workspace manifest
├── Cargo.lock
├── rust-toolchain.toml     ← pins Rust version for BPF compatibility
├── package.json            ← JS/TS dev dependencies for tests
├── tsconfig.json
├── yarn.lock
├── .anchor/                ← Anchor-generated (program log cache, IDL)
├── app/                    ← Anchor-generated placeholder (unused — website is separate)
├── programs/
│   └── condition_cover/
│       ├── Cargo.toml
│       └── src/
│           ├── lib.rs              ← program entry point; declares all modules and instructions
│           ├── constants.rs        ← ORACLE_AUTHORITY pubkey (hardcoded)
│           ├── errors.rs           ← custom error codes
│           ├── instructions/
│           │   ├── mod.rs
│           │   └── settle.rs       ← ✓ implemented
│           └── state/
│               ├── mod.rs
│               └── contract.rs     ← ✓ implemented
├── tests/
│   └── condition_cover.ts  ← integration tests (stub — to be expanded)
├── migrations/
│   └── deploy.js           ← minimal deploy script
└── target/
    └── deploy/
        ├── condition_cover.so              ← compiled BPF binary
        └── condition_cover-keypair.json    ← program keypair (keep secure)
```

---

## Program ID

```
5PkPCbdZNFGYVJNjifxgZDGyeaMKmTeWPj4fxhYeeB9K
```

Declared in `Anchor.toml` (`[programs.localnet]`) and `src/lib.rs` (`declare_id!`).

---

## Oracle Authority

The oracle wallet pubkey is hardcoded in `src/constants.rs`:

```rust
pub const ORACLE_AUTHORITY: Pubkey = pubkey!("Dtp4xjj7S56J7FFLPm5TFqA8kd3FDfNdkgAabB4cuckx");
```

Only this wallet may sign the `settle` instruction. Any other signer is rejected with `ConditionCoverError::UnauthorizedOracle`.

- Devnet keypair: `~/.config/solana/oracle-keypair.json`
- Funded: 2 SOL on devnet (2026-03-20)
- See also: `oracle/src/settlement/settle.ts`

---

## Instructions

### Implemented

| Instruction | Signer | Status |
|---|---|---|
| `create_order` | Order owner | ✓ Creates a Hedge or Cover order; locks collateral into a PDA escrow |
| `match_order` | Matcher (any) | ✓ Pairs a Hedge+Cover order; transfers premium to cover party; coverage → contract escrow |
| `cancel_order` | Order owner | ✓ Cancels an Open order; returns escrowed collateral; closes Order + escrow accounts |
| `settle` | Oracle wallet | ✓ Records outcome; transfers contract escrow to winner's token account |

---

## Account Structures

### `Contract` — `src/state/contract.rs` ✓

Stores the on-chain state for a matched contract. Created by `match_order`; settled by `settle`.

| Field | Type | Description |
|---|---|---|
| `hedge_order` | `Pubkey` | Pubkey of the hedge Order account |
| `cover_order` | `Pubkey` | Pubkey of the cover Order account |
| `hedge_token_account` | `Pubkey` | Token destination if hedge party wins (outcome=1) |
| `cover_token_account` | `Pubkey` | Token destination if cover party wins (outcome=0) |
| `expiration` | `i64` | Unix timestamp after which contract expires |
| `outcome` | `Option<u8>` | `None` = unsettled; `Some(1)` = hedge wins; `Some(0)` = cover wins |
| `bump` | `u8` | PDA bump seed |

Account size: `Contract::LEN` = 149 bytes.

### `Order` — `src/state/order.rs` ✓

Will mirror the MySQL `Orders` table key fields:

| Field | Type | Description |
|---|---|---|
| `order_type` | enum | Hedge or Cover |
| `index_name` | string | e.g. `Kp`, `Dst`, `Solar X-Ray Flux` |
| `index_level` | `f64` | Payout threshold |
| `denomination` | enum | USDC or SSTM |
| `coverage` | `u64` | Token amount locked in escrow (lamports / token units) |
| `hedge_premium` | `u64` | Premium amount |
| `expiration` | `i64` | Unix timestamp |
| `owner` | `Pubkey` | User wallet |
| `status` | enum | Open / Matched / Settled / Cancelled |
| `bump` | `u8` | PDA bump seed |

---

## Errors — `src/errors.rs` ✓

| Code | Name | Message |
|---|---|---|
| 6000 | `UnauthorizedOracle` | Signer is not the authorized oracle |
| 6001 | `AlreadySettled` | Contract has already been settled |
| 6002 | `InvalidOutcome` | Invalid outcome — must be 0 (cover wins) or 1 (hedge wins) |

---

## Tokens

| Token | Role | Notes |
|---|---|---|
| USDC | Primary stablecoin denomination | SPL token; standard mint |
| SSTM | Platform token | Custom SPL token; minted by ConditionCover |
| SOL | Layer 1 gas | Native; maps to `GasFeeLayer1` in Orders |
| LINK | Oracle gas fee | Maps to `GasFeeOracle` in Orders |

Use `anchor-spl` for all SPL token transfers (CPI to the Token program). Add `anchor-spl` to `Cargo.toml` when implementing `create_order` escrow and `settle` token transfer.

---

## Oracle Integration

The `settle` instruction enforces oracle authority via an Anchor account constraint:

```rust
#[account(
    constraint = oracle.key() == ORACLE_AUTHORITY @ ConditionCoverError::UnauthorizedOracle,
)]
pub oracle: Signer<'info>,
```

The `outcome` parameter:
- `1` — index threshold was crossed; hedge party wins
- `0` — contract expired without threshold crossing; cover party wins

The off-chain oracle service (`oracle/`) submits this instruction after evaluating NOAA space weather data. See `oracle/CLAUDE.md` for the full settlement flow.

---

## Development Workflow

### Environment

All Solana/Anchor development runs inside **WSL2 (Ubuntu 22.04)** — not native Windows.

| Tool | Version | Notes |
|---|---|---|
| Rust | 1.94.0 | via rustup |
| Solana/Agave CLI | 3.1.11 | via Agave installer |
| Anchor CLI | 0.32.1 | built from source |
| Node.js | 20.20.1 | via nvm |
| Yarn | 1.22.22 | global npm install |

WSL2 workspace path: `/mnt/c/Users/jim-f/source/repos/cc-rebuild-v2/smartcontracts`

### Local (daily development)
```bash
anchor build
anchor test
```

### Devnet (oracle integration testing)
```bash
solana config set --url devnet
# Also update Anchor.toml: cluster = "devnet"

anchor build
anchor deploy

# Run tests against devnet (no local validator)
anchor test --skip-local-validator
```

Verify deployment on [Solscan Devnet](https://solscan.io/?cluster=devnet).

---

## Key Anchor.toml Settings

```toml
[programs.localnet]
condition_cover = "5PkPCbdZNFGYVJNjifxgZDGyeaMKmTeWPj4fxhYeeB9K"

[provider]
cluster = "localnet"
wallet = "~/.config/solana/id.json"

[scripts]
test = "yarn run ts-mocha -p ./tsconfig.json -t 1000000 tests/**/*.ts"
```

---

## Relationship to MySQL

The MySQL `Orders` and `Contracts` tables mirror on-chain state for the website frontend:
- After each on-chain transaction, the oracle (or a backend listener) updates MySQL.
- The website reads from MySQL — it does not query the chain directly for most views.
- `OrderAddress` / `ContractAddress` in MySQL store Solana account pubkeys for cross-reference.

---

## To Do (implementation sequence)

1. ~~Hardcode `ORACLE_AUTHORITY` in `constants.rs`~~ ✓
2. ~~Implement `settle` instruction~~ ✓
3. ~~Implement `create_order` — PDA escrow, SPL token lock~~ ✓
4. ~~Implement `match_order` — pair orders, create `Contract` account~~ ✓
5. ~~Implement `cancel_order` — release escrowed tokens~~ ✓
6. ~~Add SPL token transfers to `settle`~~ ✓
7. ~~Write integration tests (`tests/condition_cover.ts`)~~ ✓
8. ~~All 8 integration tests passing on localnet~~ ✓
9. Deploy to devnet and run oracle end-to-end

---

## Integration Tests — `tests/condition_cover.ts`

All 8 tests pass on localnet (`anchor test`). Last verified: 2026-03-28.

### Test environment

- Local validator (Anchor default)
- Test mint stands in for USDC (6 decimals, minted by test payer)
- Hedge wallet and Cover wallet each funded with 10 test-USDC and 2 SOL
- Oracle keypair loaded from `~/.config/solana/oracle-keypair.json` (must match `ORACLE_AUTHORITY`); airdropped 2 SOL for signing fees

### Test cases

| # | Suite | Test | What it verifies |
|---|---|---|---|
| 1 | `create_order` | Hedge order creation | Order PDA created; `hedge_premium` locked in escrow; `order_type = Hedge`, `status = Open` |
| 2 | `create_order` | Cover order creation | Order PDA created; `coverage` locked in escrow; `order_type = Cover`, `status = Open` |
| 3 | `match_order` | Hedge + Cover matched | Contract PDA created; premium transferred to cover wallet; coverage moved to contract escrow; both orders marked `Matched` |
| 4 | `settle` | outcome = 1 (hedge wins) | Contract escrow transferred to hedge token account; `contract.outcome = 1` |
| 5 | `settle` | outcome = 0 (cover wins) | Contract escrow transferred to cover token account; `contract.outcome = 0` |
| 6 | `settle` | Double-settle rejected | Second settle on already-settled contract throws `AlreadySettled` (6001) |
| 7 | `cancel_order` | Open order cancelled | Escrowed collateral returned to owner; Order account closed (rent reclaimed) |
| 8 | `cancel_order` | Non-owner cancel rejected | Cancel by wrong signer throws `Unauthorized` (6007) |

### Key assertions

- **Token balances** verified via `getAccount` before/after each transfer
- **Account state** (status, outcome) verified by fetching the on-chain account after each instruction
- **PDA closure** verified by checking `getAccountInfo` returns `null` after `cancel_order`
- **Error codes** verified by checking `err.message` includes the named error constant

---

## Future: Optimistic Oracle (post-devnet)

After devnet, the single-step `settle` instruction will be replaced with an **optimistic oracle** pattern to allow a dispute window before funds are released.

**Planned instruction set (replaces `settle`):**

| Instruction | Signer | Description |
|---|---|---|
| `propose` | Oracle wallet | Sets `proposed_outcome` + `dispute_deadline` on Contract account |
| `dispute` | Any wallet | Raises a challenge during the dispute window |
| `finalize` | Oracle wallet | Releases escrowed funds after dispute window closes with no challenge |

**Contract account additions needed:**
- `proposed_outcome: Option<u8>` — oracle's submitted outcome
- `dispute_deadline: i64` — unix timestamp when the window closes
- `disputed: bool` — whether a challenge has been raised

**Do not implement during devnet.** The current `settle` instruction is the correct approach for development and testing. When designing new account fields, leave space in `Contract::LEN` for the above additions.

---

## Reference

- [Anchor Docs](https://www.anchor-lang.com/docs)
- [Solana Program Layout Guide](https://solana.com/docs/toolkit/projects/project-layout)
- [anchor-spl token CPI](https://docs.rs/anchor-spl/latest/anchor_spl/)
- [chainlink_solana crate](https://github.com/smartcontractkit/solana-starter-kit)
- [Solana SPL Token program](https://spl.solana.com/token)
