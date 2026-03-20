# ConditionCover — Oracle

Off-chain TypeScript service that bridges live NOAA space weather data to the ConditionCover Solana smart contracts. Polls five space weather indices on independent schedules, evaluates each active contract's threshold, and submits signed settlement transactions to Solana when a contract triggers or expires.

---

## How It Works

```
NOAA SWPC / Kyoto WDC
        │  (HTTP, no API key)
        ▼
  Oracle polling loop
        │  fetch → evaluate threshold
        ▼
     MySQL
  (active contracts)
        │  outcome determined
        ▼
  Solana program
  settle(outcome)  ← signed by oracle wallet only
```

1. Each index has its own polling loop aligned to the data source's update frequency.
2. Active contracts are queried from MySQL (`Orders` + `Contracts` tables).
3. Threshold crossed → `settle(outcome=1)` — hedge party wins.
4. Contract expired without trigger → `settle(outcome=0)` — cover party wins.
5. MySQL is updated with the outcome after on-chain confirmation.

---

## Data Sources

All data is served from `https://services.swpc.noaa.gov` (no API key required).

### Development / Devnet (current)

| Index | Endpoint | Format | Poll interval |
|---|---|---|---|
| Kp-Index | `products/noaa-planetary-k-index.json` | Array of arrays — 3-hour max Kp | 3 hours |
| Solar X-Ray Flux | `json/goes/primary/xrays-1-day.json` | Array of objects | 3 hours |
| Solar Proton Flux | `json/goes/primary/integral-protons-1-day.json` | Array of objects | 3 hours |
| Solar Radio Flux (F10.7) | `json/f107_cm_flux.json` | Array of objects | 3 hours |
| Dst Index | `products/kyoto-dst.json` | Array of arrays — hourly nT | 1 hour |

### Production (switch when leaving devnet)

| Index | Endpoint | Format | Poll interval |
|---|---|---|---|
| Kp-Index | `json/planetary_k_index_1m.json` | Array of objects — `estimated_kp` | 1 minute |
| Solar X-Ray Flux | `json/goes/primary/xrays-1-day.json` | Array of objects | 1 minute |
| Solar Proton Flux | `json/goes/primary/integral-protons-1-day.json` | Array of objects | 5 minutes |
| Solar Radio Flux (F10.7) | `json/f107_cm_flux.json` | Array of objects | 1 hour |
| Dst Index | `products/kyoto-dst.json` | Array of arrays — hourly nT | 1 hour |

Poll intervals are set in `src/config.ts`. See `CLAUDE.md` for the exact field changes needed when switching Kp to the production endpoint.

---

## Structure

```
oracle/
├── src/
│   ├── index.ts              ← entry point; polling loops + graceful shutdown
│   ├── config.ts             ← typed config from .env
│   ├── adapter/
│   │   ├── types.ts          ← IndexReading, IndexName types
│   │   ├── fetchKp.ts
│   │   ├── fetchXray.ts
│   │   ├── fetchProton.ts
│   │   ├── fetchF107.ts
│   │   └── fetchDst.ts       ← Kyoto WDC HTML parser
│   ├── db/
│   │   └── contracts.ts      ← MySQL queries and settlement recording
│   └── settlement/
│       └── settle.ts         ← Anchor program client; submits settle instruction
├── .env.example
├── package.json
└── tsconfig.json
```

---

## Setup

**Prerequisites:** Node.js 20+, MySQL 8+, a funded Solana oracle wallet on devnet.

```bash
npm install
cp .env.example .env
# Edit .env with your values (see .env.example for all required vars)
```

### Environment Variables

| Variable | Description |
|---|---|
| `ORACLE_KEYPAIR_PATH` | Path to oracle wallet keypair JSON (must match `ORACLE_AUTHORITY` in the smart contract) |
| `SOLANA_CLUSTER` | `devnet`, `testnet`, or `mainnet-beta` |
| `PROGRAM_ID` | Deployed Solana program ID |
| `DB_HOST` / `DB_PORT` / `DB_NAME` / `DB_USER` / `DB_PASSWORD` | MySQL connection |
| `NOAA_BASE_URL` | NOAA SWPC base URL (default: `https://services.swpc.noaa.gov`) |
| `KYOTO_DST_URL` | Kyoto WDC Dst realtime page URL |

---

## Running

```bash
# Development
npm start

# Production (compiled)
npm run build
node dist/index.js

# Via PM2 (recommended for EC2)
pm2 start dist/index.js --name "oracle"
```

Graceful shutdown on `SIGINT` / `SIGTERM` — closes MySQL pool and clears all intervals.

---

## Oracle Wallet

The oracle wallet keypair must match the `ORACLE_AUTHORITY` constant hardcoded in the Solana program (`smartcontracts/programs/condition_cover/src/constants.rs`). Any settlement transaction signed by a different wallet is rejected on-chain.

Fund the wallet with SOL before running:
```bash
solana airdrop 2 <oracle-pubkey> --url devnet
# or use https://faucet.solana.com
```

---

Copyright (c) 2026 Frontier Stream Inc. All Rights Reserved. Patent Pending (US20250245751A1, PCT/US2025/012697).
