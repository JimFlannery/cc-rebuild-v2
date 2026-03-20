# ConditionCover Rebuild v2 — Project Root

## Project Overview

ConditionCover is a space-weather risk-hedging platform. Users create and trade insurance-like contracts that pay out when geomagnetic or solar indices (Kp, Dst, etc.) cross threshold levels. Contracts are settled automatically by a Chainlink oracle reading live space weather data. Tokens are held and transferred on Solana.

The first prototype lives at `C:\Users\jim-f\source\repos\next-js` (Next.js 14, AWS Amplify, DynamoDB). This rebuild replaces the backend with Solana smart contracts, a Chainlink oracle, and a MySQL database, while keeping a Next.js frontend.

---

## Repository Layout

```
cc-rebuild-v2/
├── CLAUDE.md               ← this file
├── mysql_schema.docx       ← MySQL schema reference (converted from DynamoDB)
├── oracle/                 ← Chainlink external adapter & off-chain settlement scripts
├── smartcontracts/         ← Anchor workspace (programs, tests, devnet scripts)
│   ├── Anchor.toml
│   ├── Cargo.toml
│   ├── programs/           ← Rust on-chain programs
│   ├── tests/              ← TypeScript integration tests (local validator + devnet)
│   ├── migrations/         ← deploy script
│   └── scripts/            ← devnet helpers (airdrop, seed accounts, etc.)
└── website/                ← Next.js frontend (replacement for next-js prototype)
```

`testnet/` has been removed. Devnet/testnet tooling lives inside `smartcontracts/` following standard Anchor conventions — `tests/` for integration tests and `scripts/` for devnet helpers. There is no separate top-level testnet folder in a standard Anchor project.

Each subdirectory has its own `CLAUDE.md` with component-specific guidance.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14 (App Router), TypeScript, Tailwind CSS, Radix UI |
| Blockchain | Solana (Anchor framework) |
| Oracle | Chainlink Data Feeds (SDK v2, direct account reads) + custom off-chain adapter for NOAA SWPC data |
| Database | MySQL (replacing DynamoDB) |
| Space Weather Data | NOAA SWPC via MCP server at `C:\Users\jim-f\source\repos\space_weather_data_mcp` |
| Auth | TBD (was AWS Cognito — to be decided for rebuild) |
| Tokens | USDC (stablecoin), SSTM (platform token), SOL (gas), LINK (oracle gas) |

---

## Space Weather Data

The MCP server at `C:\Users\jim-f\source\repos\space_weather_data_mcp` provides real-time and forecast space weather data from NOAA's Space Weather Prediction Center (SWPC).

**Data sources used for contract settlement:**
- **Kp-Index** — Planetary geomagnetic index (0–9). Available via `get_kp_index()` prompt / `planetary_k_index_1m.json`.
- **Dst Index** — Disturbance Storm Time index (nT). Available via `get_dst_index()` prompt (Kyoto data, hourly).

**MCP tools available:**
- `list_known_paths()` — curated map of SWPC data file locations
- `fetch_file(path)` — fetch live JSON/text from NOAA SWPC server
- `get_space_weather_scales()` — G/S/R storm scales and solar flare A–X classifications
- `list_products(category)` — catalog of all SWPC products
- `get_data_file_info(path)` — field definitions for known JSON files

**NOAA SWPC data server:** `https://services.swpc.noaa.gov`

---

## MySQL Database Schema

Schema document: `mysql_schema.docx`
Converted from the AWS Amplify/DynamoDB definitions in the prototype's `resource.ts`.

### Tables Summary

| Table | Purpose |
|---|---|
| `Orders` | Core trading table — Hedge and Cover contract orders |
| `Contracts` | Pairs a Hedge order + Cover order into a live on-chain contract |
| `IndexProbabilities` | Reference lookup: index level → annual payout probability |
| `Tiers` | Subscription tiers: APY rates and service fees by coverage volume |
| `VariableSettings` | Global platform config (game speed, fee rates, SSTM price schedule) |
| `LogFile` | User activity analytics (page views, clicks, video timestamps) |
| `Survey` | User market-interest survey responses |
| `Feedback` | User feedback and UX ratings |
| `Todo` | Internal task list (simple, owner-only) |

### Key Design Conventions
- All PKs are `VARCHAR(36)` UUIDs (`DEFAULT (UUID())`) to match Amplify behaviour.
- Every table has `createdAt DATETIME NOT NULL` and `updatedAt DATETIME NOT NULL` audit columns.
- Financial amounts: `DECIMAL(18,8)`. Rates/percentages: `DECIMAL(10,6)`.
- Booleans: `TINYINT(1)` (0 = false, 1 = true).
- Enums use MySQL native `ENUM(...)`.

### Orders Table — Key Fields
- `OrderType` — `Hedge` or `Cover`
- `IndexName` — e.g. `Kp`, `Dst`, `Solar X-Ray Flux`, `Solar Proton Flux`, `Solar Radio Flux`
- `IndexLevel` — threshold value triggering payout
- `PayoutProbability` — calculated probability of payout event
- `Denomination` — `USDC` or `SSTM`
- `MOS` / `MOStype` — Multi-Order System flag (Type 1 = MOS, Type 2 = MicroMOS)
- `GasFeeLayer1` — SOL gas fee; `GasFeeOracle` — LINK oracle fee
- `WalletAddress`, `OrderAddress`, `DenominationAddress` — Solana on-chain addresses

### Contracts Table — Key Fields
- Links `HedgeOrderID` ↔ `CoverOrderID` from the Orders table
- `ContractAddress` — deployed Solana smart contract address
- `HedgeAddress` / `CoverAddress` — token destination addresses at settlement

---

## Supported Index Types (Contract Triggers)

| Index | Unit | Notes |
|---|---|---|
| Kp (Planetary K-Index) | 0–9 scale | Geomagnetic storm indicator; G1–G5 corresponds to Kp 5–9 |
| Dst (Disturbance Storm Time) | nT (nanotesla) | Negative values = stronger storm |
| Solar X-Ray Flux | W/m² | A→B→C→M→X classification; drives R-scale blackouts |
| Solar Proton Flux | pfu (≥10 MeV) | Drives S-scale radiation storm rating |
| Solar Radio Flux | sfu | F10.7 index proxy for solar activity |

---

## Platform Mechanics

- **Hedge party** pays a premium; receives payout if the index event occurs.
- **Cover party** collects the premium as yield; absorbs the loss if event occurs.
- **Oracle** checks live NOAA data at each `OracleChecks` interval; settles the Solana smart contract automatically.
- **MOS (Multi-Order System)** allows partial fills and rolling microperiod matching.
- **Tokens:** SSTM is the platform token with a scheduled price increase (`SSTMpriceIncrease` in `VariableSettings`). USDC is the stablecoin denomination.
- **Service fees** collected in USDC; gas fees in SOL (Layer 1) and LINK (oracle).
- **Tiers** determine the Cover party APY and service fee rate based on total coverage volume.

---

## Prototype Reference

The first prototype at `C:\Users\jim-f\source\repos\next-js` is the canonical UX reference:
- Pages: Dashboard, Contracts marketplace, Orders (create/manage), Profile, Rewards, Learn, Invite, Notifications, Feedback.
- The `app/_actions/` directory contains server-side logic worth porting.
- Currency constants (SOL, SSTM, USDC, LINK exchange rates) are in `app/_actions/currency.ts`.
- The Amplify GraphQL schema at `amplify/data/resource.ts` is the authoritative source for field names — now translated to MySQL in `mysql_schema.docx`.
