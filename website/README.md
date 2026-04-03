# ConditionCover — Website

Next.js 16 frontend for the ConditionCover environmental risk hedging platform. Provides the marketplace for creating and managing Hedge and Cover orders, live contract monitoring, SSTM token rewards, and user analytics.

This is a full rebuild of [ConditionCover.com](https://conditioncover.com), replacing the original AWS Amplify / DynamoDB backend with MySQL and Solana smart contracts.

---

## Stack

| Technology | Version | Role |
|---|---|---|
| Next.js | 16.1.6 | Framework (App Router) |
| React | 19 | UI library |
| TypeScript | 5 | Language (strict mode) |
| Tailwind CSS | 4 | Styling |
| Better Auth | latest | Email/password auth, session management |
| MySQL | 8 | Database (via server actions) |
| Solana Wallet Adapter | latest | Wallet connection and signing |
| @coral-xyz/anchor | latest | On-chain program client |

---

## Pages — Current Status

| Route | Status | Description |
|---|---|---|
| `/` | ✓ Built | Homepage — market opportunity cards + market summary bar |
| `/markets` | ✓ Built | Open hedge orders with left sidebar filters and order cards |
| `/orders/[id]` | ✓ Built | Order detail page with CoverForm for placing on-chain cover |
| `/dashboards` | ✓ Built | Market Metrics, Space Weather, and Risk Management panels |
| `/hedge` | ✓ Built | Hedge order creation — full form, on-chain submit, MySQL write |
| `/yieldboost` | ✓ Built | Yield Boost looping — Place Order and Open Orders tabs |
| `/learn` | ✓ Built | 6 lesson cards with Available / Coming Soon badges |
| `/learn/[slug]` | ✓ Built | Dynamic lesson sub-pages; Lesson 2 has YouTube embed |
| `/rewards` | ✓ Built | SSTM token rewards and tier table |
| `/legal` | ✓ Built | Full legal disclaimer |
| `/contracts` | Planned | Live on-chain contract monitoring |
| `/profile` | Planned | Wallet connection and account settings |
| `/notifications` | Planned | Contract event alerts |
| `/feedback` | Planned | User feedback and UX ratings |
| `/invite` | Planned | Referral system |
| `/resources` | Planned | Help documentation |

---

## Homepage Cards

The homepage (`/`) is a market opportunity page with two sections and five cards.

**Section 1 — Earn Income (Supply Cover):**
- **Card 1 — Max Tier:** Pre-filled with the max-tier threshold amount. Links directly to the matching open order (`/orders/[id]`) if one exists; otherwise `/markets` with coverage filter.
- **Card 2 — Next Tier:** Personalised nudge to reach the next tier. Shows "Connect wallet" placeholder until wallet is available.
- **Card 3 — Free Form Cover:** Client component with live APY calculation as amount is entered.
- **Card 4 — Delta Neutral:** Finds an open Yield Boost eligible order and links directly to it.

**Section 2 — Secure Cover (Hedge):**
- **Card 5 — Free Form Hedge:** Client component; routes to `/hedge` for order creation.

---

## Markets & Orders

`/markets` fetches open hedge orders server-side and displays them as cards with a left sidebar. Supports filtering by index, denomination, coverage range, probability range, and contract duration. Clicking a card navigates to `/orders/[id]`.

`/orders/[id]` shows the full order details (payout condition, coverage, duration, premium, settlement explanation) with a sticky `CoverForm` on the right. Submitting the form:
1. Calls `create_order` on the Solana smart contract (via Anchor, funds go into PDA escrow).
2. Writes the cover order to MySQL via `createHedgeOrder` server action.

Yield Boost eligible orders (SSTM, coverage ≥ `YieldBoostMinCoverage`) show an amber notice in the form.

---

## Yield Boost / Looping (`/yieldboost`)

One-Click Delta Neutral looping for large positions. Two tabs:

- **Place Order:** Enter a coverage amount (default $1M SSTM at Dst −850 nT). Tier APY is calculated live. Submitting creates a seed loop order on-chain and writes to MySQL (`IsLoopOrder = 1`).
- **Open Orders:** Lists unmatched loop orders. The **Match** button executes the full on-chain flow: `createOrder ×2` (both sides for the matcher), `createLoopSet`, `matchOrder ×2`, `registerLoopContract ×2`, then writes to MySQL.

All looping variables (loan LTV, interest rate, reward APY) are stored in `VariableSettings` and loaded via `getLoopSettings`.

---

## Server Actions (`app/_actions/`)

| File | Purpose |
|---|---|
| `testDb.ts` | DB connection test |
| `prices.ts` | Jupiter Price API v6 for SOL/USDC/LINK; SSTM hardcoded at $9.024; 60 s cache |
| `getTiers.ts` | Reads `Tiers` table — APY rates and service fees by coverage volume |
| `createHedgeOrder.ts` | Inserts a row into `Orders` after successful on-chain `create_order` |
| `getDashboardMetrics.ts` | Platform aggregate metrics; per-wallet risk metrics |
| `getOpenHedgeOrders.ts` | Open standard hedge orders with filters and `yieldBoostEligible` flag |
| `getOrderById.ts` | Single order fetch by ID |
| `getHomePageData.ts` | `findBestMatchingOrder` and `findYieldBoostOrder` for homepage card linking |
| `getLoopSettings.ts` | Reads 7 loop variables from `VariableSettings` with fallback defaults |
| `createLoopOrder.ts` | Writes a seed loop order to `Orders` (`IsLoopOrder = 1`) |
| `getOpenLoopOrders.ts` | Fetches unmatched open loop orders |
| `matchLoopOrder.ts` | Marks seed order Matched, creates `LoopSets` record, creates initial contract pair in `Orders` |

**Rule:** Every export from a `'use server'` file must be `async`. Pure helpers go in `lib/`.

---

## Database Migrations

Run all migrations in order against the `condition_cover` database. Each is idempotent (uses `ADD COLUMN` only if the column doesn't already exist):

| File | What it adds |
|---|---|
| `scripts/migrations/001_add_loop_variables.sql` | 7 loop rate columns to `VariableSettings` |
| `scripts/migrations/002_add_loop_sets.sql` | 5 loop columns to `Orders`; creates `LoopSets` table |
| `scripts/migrations/003_add_yield_boost_standard.sql` | `YieldBoostMinCoverage`, `YieldBoostMaxUncoveredRisk`, `YieldBoostMaxLoops` to `VariableSettings` |

**All three migrations have been applied** to the local development database as of 2026-04-02.

---

## Library Files (`lib/`)

| File | Purpose |
|---|---|
| `db.ts` | mysql2 connection pool |
| `auth.ts` | Better Auth server config; `kycVerified` defaults to `true` for dev |
| `auth-client.ts` | `useSession`, `signIn`, `signOut`, `signUp` |
| `utils.ts` | `cn()` (clsx + tailwind-merge) |
| `orderConstants.ts` | Payout conditions, annual odds, fixed-point encoding, mint addresses, program ID, `matchTier()` |
| `lessons.ts` | 6 lesson definitions — slug, title, blurb, description, duration, video config |
| `idl/condition_cover.json` | Anchor IDL copy — keep in sync with `smartcontracts/target/idl/condition_cover.json` |

---

## Key Integration Points

**MySQL** — All data reads and writes go through Next.js Server Actions (`app/_actions/`). The website does not query the Solana chain directly for most views.

**Solana Wallet** — User identity is tied to a Solana wallet (replacing AWS Cognito). `WalletAddress` is the primary user identifier across the `Orders` and `Contracts` tables.

**On-chain calls** — Hedge order creation (`/hedge`), cover order creation (`/orders/[id]`), and loop order matching (`/yieldboost`) all call the `condition_cover` Anchor program directly from the browser using `useAnchorWallet()`.

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

After changing `lib/auth.ts`, re-run the Better Auth migration:

```bash
echo "y" | npx @better-auth/cli migrate --config lib/auth.ts
```

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
