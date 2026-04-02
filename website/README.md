# ConditionCover — Website

Next.js 16 frontend for the ConditionCover environmental risk hedging platform launching with space weather. Provides the marketplace for creating and managing Hedge and Cover orders, live contract monitoring, SSTM token rewards, and user analytics.

This is a full rebuild of [ConditionCover.com](https://conditioncover.com), replacing the original AWS Amplify / DynamoDB backend with MySQL and Solana smart contracts.

---

## Stack

| Technology | Version | Role |
|---|---|---|
| Next.js | 16.1.6 | Framework (App Router) |
| React | 19 | UI library |
| TypeScript | 5 | Language (strict mode) |
| Tailwind CSS | 4 | Styling |
| MySQL | 8 | Database (via server actions) |
| Solana Wallet Adapter | latest | Wallet connection and signing |

---

## Pages

| Route | Status | Description |
|---|---|---|
| `/` | In progress | Homepage — opportunity cards marketplace |
| `/orders` | Planned | Create and manage Hedge / Cover orders |
| `/contracts` | Planned | Live on-chain contract monitoring |
| `/rewards` | Planned | SSTM token rewards and points |
| `/looping` | Planned | Offset order loans (delta-neutral positions) |
| `/profile` | Planned | Wallet connection and account settings |
| `/notifications` | Planned | Contract event alerts |
| `/learn` | Planned | Educational video content |
| `/feedback` | Planned | User feedback and UX ratings |
| `/invite` | Planned | Referral system |
| `/resources` | Planned | Help documentation |

---

## Key Integration Points

**MySQL** — All data reads and writes go through Next.js Server Actions (`app/_actions/`). The website does not query the Solana chain directly for most views.

**Solana Wallet** — User identity is tied to a Solana wallet (replacing AWS Cognito). `WalletAddress` is the primary user identifier across the `Orders` and `Contracts` tables.

**Oracle** — Contract settlement is automatic. The frontend displays oracle check count (`OracleChecks`), index threshold (`IndexLevel`), and final outcome (`ContractOutcome`) — it does not trigger settlement.

**Space Weather Data** — Index values displayed in the UI are proxied through a server action, not fetched directly from NOAA in the browser.

---

## Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Environment Variables

Copy `.env.example` to `.env.local` and fill in values:

| Variable | Description |
|---|---|
| `DB_HOST` / `DB_PORT` / `DB_NAME` / `DB_USER` / `DB_PASSWORD` | MySQL connection |
| `NEXT_PUBLIC_SOLANA_CLUSTER` | `devnet`, `testnet`, or `mainnet-beta` |
| `NEXT_PUBLIC_PROGRAM_ID` | Deployed Solana program ID |

---

## Production Build

```bash
npm run build
npm start

# Via PM2 (recommended for EC2)
pm2 start npm --name "website" -- start
```

See [DEPLOYMENT.md](../DEPLOYMENT.md) at the repo root for the full EC2 + nginx + PM2 setup.

---

## Prototype Reference

The original ConditionCover prototype is at `C:\Users\jim-f\source\repos\next-js` (Next.js 14, AWS Amplify, DynamoDB). Use it as the UX and logic reference when porting routes. Key files:

- `app/_actions/` — server-side logic and currency conversion constants
- `amplify/data/resource.ts` — original field names (now translated to MySQL in `mysql_schema.docx`)

---

Copyright (c) 2026 Frontier Stream Inc. All Rights Reserved. Patent Pending (US20250245751A1, PCT/US2025/012697).
