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
| `settle` | Oracle wallet | ✓ Implemented — records outcome on Contract account; token transfers TODO |

### Planned

| Instruction | Signer | Description |
|---|---|---|
| `create_order` | Order owner | Creates a Hedge or Cover order; locks collateral (USDC or SSTM) into a PDA escrow |
| `match_order` | Matcher (any) | Pairs a Hedge order with a Cover order; creates a live `Contract` account |
| `cancel_order` | Order owner | Cancels an unfilled order; releases escrowed tokens back to the user |

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

### `Order` — `src/state/order.rs` (planned)

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
2. ~~Implement `settle` instruction~~ ✓ (outcome recorded on-chain; token transfers pending)
3. Implement `create_order` — PDA escrow, SPL token lock (requires adding `anchor-spl`)
4. Implement `match_order` — pair orders, create `Contract` account
5. Implement `cancel_order` — release escrowed tokens
6. Add SPL token transfers to `settle` — move collateral to winner's token account
7. Write integration tests (`tests/condition_cover.ts`)
8. Deploy to devnet and run oracle end-to-end

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
