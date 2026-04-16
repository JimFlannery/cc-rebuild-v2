# ConditionCover

**Space-weather risk hedging on Solana.**

ConditionCover is a decentralised platform that lets users create and trade insurance-like contracts that pay out automatically when geomagnetic or solar indices (Kp, Dst, Solar X-Ray Flux, Proton Flux, Solar Radio Flux) cross user-defined threshold levels. Contracts are settled by a custom oracle reading live NOAA Space Weather Prediction Center data, with funds held and transferred on the Solana blockchain.

This repository is a full rebuild of [ConditionCover.com](https://conditioncover.com), replacing the original AWS Amplify / DynamoDB backend with Solana smart contracts, a Chainlink-compatible oracle, and a MySQL database.

---

## How It Works

1. A **Hedge party** pays a premium and receives a payout if a specified space weather event occurs (e.g. Kp-Index ≥ 5 or Dst < −850 nT).
2. A **Cover party** collects the premium as yield and absorbs the loss if the event occurs. All market contracts include **risk sharing** — cover exposure is offset automatically.
3. A **custom oracle** polls NOAA SWPC data on a continuous basis and automatically settles the on-chain contract when a threshold is crossed or the contract expires.
4. All collateral is held in escrow on Solana (USDC or SSTM) and transferred to the winner without manual intervention.
5. **Yield Boost** provides delta-neutral income through two channels:
   - **Community Yield Boost** — pool-based, $2,000 SSTM minimum, longer contract durations for TVL stability
   - **Peer-to-Peer Yield Boost** — direct counterparty matching, $50,000 SSTM minimum, higher reward tiers
   
   Both use treasury-issued SSTM loans to create looped contract pairs that amplify returns.

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
│                       transfers funds to the winning party; includes
│                       Yield Boost looping (Treasury + LoopSet)
└── website/            Next.js 16 frontend — marketplace, order creation,
                        contract management, Yield Boost, Learn, and rewards
```

---

## Build Status

### Website — `website/`

| Component | Status |
|---|---|
| Homepage (two-option landing: Markets + Yield Boost) | ✓ Built |
| Markets page (order cards, sidebar filters, risk sharing) | ✓ Built |
| Order detail page (`/orders/[id]` + partial-fill CoverForm) | ✓ Built |
| Hedge order creation (`/hedge`) | ✓ Built |
| Yield Boost (`/yieldboost` — Community + P2P tabs) | ✓ Built |
| Dashboards (Market Metrics, Space Weather, Risk Management) | ✓ Built |
| Learn page (6 lessons, YouTube embed) | ✓ Built |
| Rewards page (SSTM tier table) | ✓ Built |
| Legal disclaimer | ✓ Built |
| Contracts monitoring (`/contracts`) | Planned |
| Profile, Notifications, Feedback, Invite | Planned |

### Smart Contracts — `smartcontracts/`

| Component | Status |
|---|---|
| `create_order` — lock collateral into PDA escrow | ✓ Implemented |
| `match_order` — pair orders, create Contract account | ✓ Implemented |
| `cancel_order` — release escrow, close Order account | ✓ Implemented |
| `settle` — oracle settles, transfers to winner | ✓ Implemented |
| `init_treasury` / `fund_treasury` — Yield Boost treasury | ✓ Implemented |
| `create_loop_set` — delta-neutral loop registry | ✓ Implemented |
| `issue_loop_loan` — Treasury → users SSTM loans | ✓ Implemented |
| `register_loop_contract` — link Contract into LoopSet | ✓ Implemented |
| `settle_loop_set` — collect interest, mark settled | ✓ Implemented |
| Integration tests (24/24 passing on localnet) | ✓ Complete |
| Deploy to devnet | ✓ Deployed |

### Oracle — `oracle/`

| Component | Status |
|---|---|
| Kp-Index poller (NOAA SWPC) | ✓ Implemented |
| Dst-Index poller (Kyoto WDC) | ✓ Implemented |
| Solar X-Ray Flux poller (NOAA GOES) | ✓ Implemented |
| Solar Proton Flux poller (NOAA GOES) | ✓ Implemented |
| Solar Radio Flux / F10.7 poller (NOAA SWPC) | ✓ Implemented |
| `settle` instruction client | ✓ Implemented |
| MySQL status updates after settlement | ✓ Implemented |
| End-to-end devnet test | Pending |

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

| Index | Source | Unit | Payout condition |
|---|---|---|---|
| Kp (Planetary K-Index) | NOAA SWPC | 0–9 scale | `Kp ≥ threshold` |
| Dst (Disturbance Storm Time) | Kyoto World Data Center | nT | `Dst < threshold` (negative storms) |
| Solar X-Ray Flux | NOAA GOES | W/m² | `flux ≥ threshold` |
| Solar Proton Flux | NOAA GOES | pfu (≥10 MeV) | `flux ≥ threshold` |
| Solar Radio Flux (F10.7) | NOAA SWPC | sfu | `flux ≥ threshold` |

**Fixed-point encoding:** `IndexLevel` is stored as an integer ×100 both on-chain and in MySQL. The oracle divides by 100 before comparing. E.g. Kp 7.0 → `700`; Dst −850 nT → `−85000`.

---

## Authentication & Access

The site is publicly browsable. Full trading access requires three steps in sequence:

| Step | Requirement | Unlocks |
|---|---|---|
| 1 | Register / Login (Better Auth) | Profile, order history |
| 2 | KYC / AML verification (third-party — not yet live) | Connect Wallet button |
| 3 | Connect Phantom wallet | Create and manage orders |

`kycVerified` defaults to `true` in `website/lib/auth.ts` during development — flip to `false` before launch.

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

> Smart contract development requires **WSL2 (Ubuntu 22.04)** on Windows.

### Quick Start

```bash
# Website
cd website && npm install && npm run dev

# Oracle
cd oracle && npm install && cp .env.example .env
# fill in .env, then:
npm start

# Smart contracts (WSL2 — set PATH first)
export PATH="/home/jimf/.cargo/bin:/home/jimf/.local/share/solana/install/active_release/bin:$PATH"
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

### Database Migrations

Run all migrations against `condition_cover` in MySQL CLI:

```sql
USE condition_cover;
SOURCE website/scripts/migrations/001_add_loop_variables.sql;
SOURCE website/scripts/migrations/002_add_loop_sets.sql;
SOURCE website/scripts/migrations/003_add_yield_boost_standard.sql;
SOURCE website/scripts/migrations/004_add_sstm_price_and_community_orders.sql;
```

Seed the first Community Yield Boost order:

```sql
SOURCE website/scripts/seed_community_order.sql;
```

All four migrations have been applied to the local development database as of 2026-04-15.

### Devnet Deployment

Smart contracts are deployed to Solana devnet. Run the setup script from WSL2:

```bash
cd /mnt/c/Users/jim-f/source/repos/cc-rebuild-v2/smartcontracts
bash scripts/devnet-setup.sh
```

This creates the SSTM mint, airdrops SOL, and deploys the program. Addresses are saved to `smartcontracts/scripts/devnet-addresses.txt`.

| Address | Value |
|---|---|
| Program ID | `5PkPCbdZNFGYVJNjifxgZDGyeaMKmTeWPj4fxhYeeB9K` |
| SSTM Mint | `GzHNybBLLxt7BcAs7ogTmD4m5Wnz8gRkwiHNpFkDY41S` |

Phantom wallet must be switched to Devnet (Settings > Developer Settings).

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
