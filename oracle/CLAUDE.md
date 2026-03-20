# ConditionCover — Oracle

## Purpose

The oracle is the bridge between real-world space weather data (NOAA SWPC) and the Solana smart contracts. It is responsible for:

1. Fetching live index values from NOAA SWPC (and Kyoto WDC for Dst) at each check interval.
2. Evaluating whether a contract's trigger threshold (`IndexLevel`) has been crossed.
3. Submitting the settlement result to the on-chain Solana program.

Settlement is **automatic and trustless** — the smart contract accepts data only from the authorized oracle account (`constants::ORACLE_AUTHORITY` in `smartcontracts/`).

---

## Chainlink on Solana

Chainlink on Solana uses **Data Feeds** (Offchain Reporting / OCR) — not a self-hosted node. There is no Chainlink node to run. Instead:

- Chainlink maintains oracle network accounts on Solana devnet and mainnet-beta.
- The on-chain program (in `smartcontracts/`) can read those accounts directly using the `chainlink_solana` crate (SDK v2).
- SDK v2 uses **direct account reads** (not CPI calls), which is cheaper in compute units than the older v1 approach.

**Chainlink does not provide a Kp-Index or Dst feed** — those are space weather indices not covered by standard Chainlink Data Feeds (which focus on asset prices). The oracle fetches this data directly from NOAA SWPC and Kyoto WDC. The `chainlink_solana` crate is available in `smartcontracts/` for any asset price feeds (e.g. SOL/USD, LINK/USD) that may be needed in future.

---

## Space Weather Data Sources

The oracle fetches data directly from NOAA SWPC and Kyoto WDC at runtime — no dependency on the MCP server. The MCP server (`C:\Users\jim-f\source\repos\space_weather_data_mcp`) is a development and exploration tool only.

### NOAA SWPC — `https://services.swpc.noaa.gov`

No API key required. All five indices are served from the same base URL.

#### Development / Testing (current)

Lower-frequency endpoints suitable for devnet testing. Less noisy, easier to observe threshold crossings during development.

| Index | NOAA path | Format | Value field | Update frequency |
|---|---|---|---|---|
| Kp-Index | `products/noaa-planetary-k-index.json` | Array of arrays | `row[1]` (string → float) — max Kp over 3-hour period | 3 hours |
| Dst Index | `products/kyoto-dst.json` | Array of arrays | `row[1]` (number) — hourly nT value | 1 hour |

Both files use the same structure: row `[0]` is the header `["time_tag", ...]`; subsequent rows are data; last row is most recent.

#### Production (switch when ready)

| Index | NOAA path | Format | Value field | Update frequency |
|---|---|---|---|---|
| Kp-Index | `json/planetary_k_index_1m.json` | Array of objects | `estimated_kp` (decimal) | 1 minute |
| Dst Index | `products/kyoto-dst.json` | Array of arrays | `row[1]` (same) | 1 hour |

To switch Kp to production: update `fetchKp.ts` endpoint and parse `estimated_kp` from the object format. Update `config.ts` `kpMs` from `3 * 60 * 60_000` to `60_000`.

#### Other Indices (unchanged)

| Index | NOAA path | Format | Value field | Update frequency |
|---|---|---|---|---|
| Solar X-Ray Flux | `json/goes/primary/xrays-1-day.json` | Array of objects | `flux` W/m², channel `0.1-0.8nm` | 1 minute |
| Solar Proton Flux | `json/goes/primary/integral-protons-1-day.json` | Array of objects | `flux` pfu, channel `>=10 MeV` | 5 minutes |
| Solar Radio Flux (F10.7) | `json/f107_cm_flux.json` | Array of objects | `flux` sfu (newest-first) | 3× per day |

---

## Threshold Comparison

| Index | Trigger condition | Notes |
|---|---|---|
| Kp | `estimated_kp >= IndexLevel` | Storms are above threshold |
| Solar X-Ray Flux | `flux >= IndexLevel` | W/m² (e.g. 1e-4 for X-class) |
| Solar Proton Flux | `flux >= IndexLevel` | pfu (e.g. 10 for S1) |
| Solar Radio Flux | `flux >= IndexLevel` | sfu |
| Dst | `value <= IndexLevel` | Storms are *more negative* than threshold (e.g. -100 nT) |

---

## Settlement Logic

Each contract pair in MySQL (`Orders` + `Contracts` tables) has:
- `IndexName` — which index to monitor (e.g. `Kp`, `Dst`)
- `IndexLevel` — the threshold value stored in `Orders`
- `OracleChecks` — incremented after every poll cycle
- `ContractExpiration` — deadline stored in `Orders`
- `ContractOutcome` — set in `Contracts` after settlement (1 = hedge wins, 0 = cover wins)

**Per-poll flow (runs for each index type):**
1. Fetch current index value from data source.
2. Query MySQL for active contracts (`ContractOutcome IS NULL`, `ContractExpiration > NOW()`).
3. For each active contract: increment `OracleChecks`; if threshold crossed → `settle(outcome=1)`.
4. Query MySQL for expired unsettled contracts (`ContractExpiration <= NOW()`).
5. For each expired contract: `settle(outcome=0)`.
6. On successful on-chain settlement: update `ContractOutcome` and `Status` in MySQL.

---

## Oracle Wallet

| Property | Value |
|---|---|
| Devnet pubkey | `Dtp4xjj7S56J7FFLPm5TFqA8kd3FDfNdkgAabB4cuckx` |
| Keypair path | `~/.config/solana/oracle-keypair.json` |
| On-chain authority | `constants::ORACLE_AUTHORITY` in `smartcontracts/programs/condition_cover/src/constants.rs` |
| Funded | 2 SOL on devnet (2026-03-20) |

The `settle` instruction on the Anchor program enforces:
```rust
constraint = oracle.key() == ORACLE_AUTHORITY @ ConditionCoverError::UnauthorizedOracle
```

---

## Oracle Gas

- Settlement transactions consume SOL (Layer 1 gas) from the oracle wallet.
- The `GasFeeOracle` field in the `Orders` table (LINK) is reserved for potential future use with Chainlink Data Streams or a Chainlink node setup.
- For devnet: fund the oracle wallet with SOL via `solana airdrop` or [faucet.solana.com](https://faucet.solana.com).

---

## Folder Structure

```
oracle/
├── CLAUDE.md                     ← this file
├── package.json                  ← @coral-xyz/anchor, @solana/web3.js, mysql2, dotenv
├── tsconfig.json
├── .env.example                  ← all required env vars documented
└── src/
    ├── index.ts                  ← entry point; 5 polling loops + graceful shutdown
    ├── config.ts                 ← typed config loaded from .env
    ├── adapter/
    │   ├── types.ts              ← IndexReading, IndexName types
    │   ├── fetchKp.ts            ← NOAA planetary_k_index_1m.json
    │   ├── fetchXray.ts          ← NOAA xrays-1-day.json (0.1-0.8nm channel)
    │   ├── fetchProton.ts        ← NOAA integral-protons-1-day.json (>=10 MeV channel)
    │   ├── fetchF107.ts          ← NOAA f107_cm_flux.json
    │   └── fetchDst.ts           ← Kyoto WDC HTML parser
    ├── db/
    │   └── contracts.ts          ← MySQL pool; active/expired queries; recordSettlement
    └── settlement/
        └── settle.ts             ← Anchor program client; submitSettlement()
```

---

## Development Notes

- Run against **devnet** during development; ensure `SOLANA_CLUSTER=devnet` in `.env`.
- Use `solana-test-validator` locally to iterate without devnet rate limits (update `SOLANA_CLUSTER=localnet`).
- The oracle wallet (`ORACLE_AUTHORITY`) must match the constant in `smartcontracts/` exactly — changing it requires rebuilding and redeploying the Anchor program.
- Kp and X-ray data update every minute. Proton every 5 minutes. F10.7 and Dst hourly. The pollers are already aligned to these frequencies in `config.ts`.
- Do not hammer NOAA endpoints — the poll intervals in `config.ts` are the minimum; increase them if rate limiting is observed.
- Chainlink **Data Streams** became available on Solana mainnet in October 2024 (~400ms latency). This may be relevant if sub-minute settlement becomes a requirement in future.

---

## To Do (implementation sequence)

1. ~~Hardcode `ORACLE_AUTHORITY` in `smartcontracts/`~~ ✓
2. ~~Implement `settle` instruction (on-chain)~~ ✓
3. Implement `create_order` and `match_order` instructions (on-chain) — needed to create `Contract` accounts that `settle` operates on.
4. Add SPL token escrow to `settle` — transfer collateral to winner's token account.
5. Wire up MySQL `Status` field updates after each on-chain event.
6. Write integration tests (`smartcontracts/tests/condition_cover.ts`).

---

## Future: Optimistic Oracle (post-devnet)

After devnet, the single-step settlement flow will be upgraded to an **optimistic oracle** pattern to allow a dispute window before funds are released.

**Planned two-step flow:**
1. Oracle submits `propose(outcome)` — sets `proposed_outcome` and starts a `dispute_deadline` clock.
2. After the dispute window passes with no challenge → `finalize()` releases escrowed funds to the winner.
3. If disputed during the window → a resolution process (governance / multisig) adjudicates.

This requires new oracle-side logic to submit `propose` instead of `settle`, poll for the dispute deadline, and call `finalize` once the window closes.

**Do not implement during devnet.** The current `settle` instruction is the correct approach for development and testing.
