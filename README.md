# ConditionCover

**Space-weather risk hedging on Solana.**

ConditionCover is a decentralised platform that lets users create and trade insurance-like contracts that pay out automatically when geomagnetic or solar indices (Kp, Dst, Solar X-Ray Flux, Proton Flux, Solar Radio Flux) cross user-defined threshold levels. Contracts are settled by a custom oracle reading live NOAA Space Weather Prediction Center data, with funds held and transferred on the Solana blockchain.

This repository is a full rebuild of [ConditionCover.com](https://conditioncover.com), replacing the original AWS Amplify / DynamoDB backend with Solana smart contracts, a Chainlink-compatible oracle, and a MySQL database.

---

## How It Works

1. A **Hedge party** pays a premium and receives a payout if a specified space weather event occurs (e.g. Kp-Index ≥ 5).
2. A **Cover party** collects the premium as yield and absorbs the loss if the event occurs.
3. A **custom oracle** polls NOAA SWPC data on a continuous basis and automatically settles the on-chain contract when a threshold is crossed or the contract expires.
4. All collateral is held in escrow on Solana (USDC or SSTM) and transferred to the winner without manual intervention.

---

## Repository Structure

This is a monorepo containing all three platform components.

```
cc-rebuild-v2/
├── oracle/             Off-chain TypeScript service — polls NOAA SWPC,
│                       evaluates contract thresholds, submits Solana
│                       settlement transactions
├── smartcontracts/     Solana on-chain program (Anchor / Rust) — holds
│                       collateral in escrow, enforces oracle authority,
│                       transfers funds to the winning party
└── website/            Next.js 16 frontend — marketplace, order creation,
                        contract management, rewards, and analytics
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16 (App Router), TypeScript, Tailwind CSS 4 |
| Auth | Better Auth — email/password, session management, KYC/AML hooks |
| Blockchain | Solana — Anchor 0.32 framework (Rust) |
| Wallet | Phantom (via `@solana/wallet-adapter-react`) |
| Oracle | Custom off-chain adapter — NOAA SWPC + Kyoto WDC data feeds |
| Price Feeds | Chainlink Data Feeds SDK v2 (direct Solana account reads) |
| Database | MySQL 8 |
| Tokens | USDC (stablecoin), SSTM (platform token), SOL (gas), LINK (oracle gas) |

---

## Space Weather Indices

Contracts can be written against any of the following indices:

| Index | Source | Unit | Update Frequency |
|---|---|---|---|
| Kp (Planetary K-Index) | NOAA SWPC | 0–9 scale | 1 minute |
| Dst (Disturbance Storm Time) | Kyoto World Data Center | nT | Hourly |
| Solar X-Ray Flux | NOAA GOES | W/m² | 1 minute |
| Solar Proton Flux | NOAA GOES | pfu (≥10 MeV) | 5 minutes |
| Solar Radio Flux (F10.7) | NOAA SWPC | sfu | 3× daily |

---

## Authentication & Access

The site is publicly browsable. Full trading access requires completing three steps in sequence:

| Step | Requirement | Unlocks |
|---|---|---|
| 1 | Register / Login (Better Auth) | Profile, notifications, order history |
| 2 | KYC / AML verification (third-party) | Connect Wallet button |
| 3 | Connect Phantom wallet | Create and manage orders |

See `website/CLAUDE.md` for full auth flow documentation.

---

## Development Setup

Each component has its own setup guide in its subdirectory `CLAUDE.md`.

### Prerequisites

| Tool | Version | Used by |
|---|---|---|
| Node.js | 20.x | Website, Oracle |
| Rust | 1.94.0 | Smart contracts |
| Solana / Agave CLI | 3.1.11 | Smart contracts |
| Anchor CLI | 0.32.1 | Smart contracts |
| MySQL | 8.x | Website, Oracle |
| Phantom | latest | Testing wallet flows |

> Smart contract development requires WSL2 (Ubuntu 22.04) on Windows.

### Quick Start

```bash
# Website
cd website && npm install && npm run dev

# Oracle
cd oracle && npm install && cp .env.example .env
# fill in .env, then:
npm start

# Smart contracts (WSL2)
cd smartcontracts && anchor build && anchor test
```

### Website Environment Variables

Create `website/.env.local`:

```env
# MySQL
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=<password>
DB_NAME=condition_cover

# Better Auth
BETTER_AUTH_SECRET=<random 32+ byte secret>
BETTER_AUTH_URL=http://localhost:3000
NEXT_PUBLIC_BETTER_AUTH_URL=http://localhost:3000
```

After changing `website/lib/auth.ts`, re-run the Better Auth migration:

```bash
cd website && echo "y" | npx @better-auth/cli migrate --config lib/auth.ts
```

---

## Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) for the full deployment reference, including:
- AWS EC2 architecture (single-instance dev setup)
- GitHub Actions CI/CD workflows
- PM2 and nginx configuration
- Smart contract deployment to Solana devnet / mainnet

---

## License & Legal

Copyright (c) 2026 Frontier Stream Inc. All Rights Reserved. Patent Pending (US20250245751A1, PCT/US2025/012697).

ConditionCover is operated by **Frontier Stream Inc.**, a Delaware C Corporation, doing business as **ConditionCover**.

This software is proprietary. No part of this codebase may be copied, modified, distributed, or used without the express written permission of Frontier Stream Inc.
