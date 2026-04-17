# ConditionCover — Website (Next.js Frontend)

## Stack

- **Next.js 16.1.6** (App Router)
- **React 19**
- **TypeScript 5** (strict mode)
- **Tailwind CSS v4** (via `@tailwindcss/postcss`)
- **ESLint 9** (`eslint-config-next`)
- **Better Auth** — email/password auth, MySQL adapter
- **@coral-xyz/anchor** — Anchor program client for browser on-chain calls
- **@solana/wallet-adapter-react** — Phantom wallet integration
- **@solana/spl-token** — ATA derivation
- Path alias: `@/*` → project root

No Radix UI / shadcn component library installed. UI is hand-built with Tailwind.

---

## Navigation & Layout

The prototype used a **side navigation menu**. This has been replaced with a **top navigation bar** — there is no sidebar in the rebuild. All routes are accessed from the top nav.

### Width convention
All pages and the navbar inner content use **`max-w-7xl`** (1280 px) centered with `mx-auto`.
Standard page `<main>` class: `mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 py-8`.

### Root layout (`app/layout.tsx`)
`ThemeProvider → WalletProvider → Nav → <div flex-1>{children}</div> → Footer`
Body: `flex flex-col min-h-screen` so Footer always sits at the bottom.

### Navbar (`components/nav.tsx`)
Two rows inside a `max-w-7xl` inner wrapper (header background stays full-width):
- Row 1: Logo · centered tagline (md+) · ThemeToggle · **wallet dropdown** · user menu / Login
- Row 2: Scrollable nav links

**Nav links (current):** Markets · Dashboards · Yield Boost · Hedge · Learn-to-Earn (`/learn`) · Rewards
**Removed from nav, now in footer:** Resources · Feedback · Invite Friends · Legal Disclaimer

**Wallet dropdown** (`SUPPORTED_WALLETS` array at top of nav.tsx):
- Not connected → "Connect Wallet" opens dropdown listing wallets with icons. Only Phantom supported now. Shows "Solana Devnet" label.
- Connected → shows Phantom icon + truncated address (4…4); dropdown offers Disconnect. Shows "Solana Devnet" label.
- Phantom icon: `/public/Phantom_SVG_Icon.svg`
- Adding more wallets: append to `SUPPORTED_WALLETS`.
- **KYC gate removed for development.** The original State 2 (disabled button + tooltip) is bypassed until the KYC service is live. See Access States section below for the intended pre-launch flow.

**Navbar border:** `border-gray-300 dark:border-white/20` (overrides `border-border` for better visibility).

### Footer (`components/footer.tsx`)
Full-width `bg-gray-200 / dark:bg-slate-800` band, content constrained to `max-w-7xl`.
Links: Invite Friends · Resources · Feedback · Legal Disclaimer
Copyright: `© 2026 Frontier Stream, Inc. All Rights Reserved. Patent Pending.`

---

## Homepage

The homepage (`app/page.tsx`) is a simple landing page with two clear entry points:

1. **Supply Cover & Earn up to 17%** — links to `/markets`. All market contracts include risk sharing. No Yield Boost on market orders.
2. **Delta Neutral Income** — links to `/yieldboost`. Both Community and P2P Yield Boost on that page.

Below the two option cards is a **platform stats bar** showing: Premiums Earned, Cover Secured, TVL (SSTM), TVL (USDC), Total Income Earned, SSTM Price. Six stats in a single row on desktop.

Cover Supplied and Cover Sought are shown in the top nav bar, not duplicated on the homepage.

The old five-card layout (`HomeCards.tsx`) is retained for reference but no longer imported. A future "Featured Opportunities" section may link directly to active orders.

---

## Pages — Current Status

| Route | Status | Notes |
|---|---|---|
| `/` | **Built** | Two-option landing page + platform stats |
| `/markets` | **Built** | Order cards, sidebar filters, risk sharing (no Yield Boost) |
| `/markets/[id]` | **Built** | Market order detail + partial-fill CoverForm (the fill page) |
| `/orders` | **Built** | My Orders list — all orders placed by connected wallet, clickable rows |
| `/orders/[id]` | **Built** | My Order detail — monitoring view with fills, actions (cancel), on-chain refs |
| `/contracts` | **Built** | My Contracts list — matched contracts, clickable rows |
| `/contracts/[id]` | **Built** | My Contract detail — parties, outcome, linked orders, on-chain refs |
| `/dashboards` | **Built** | See Dashboards section below |
| `/yieldboost` | **Built** | Open Orders (Community + P2P columns) and Place P2P Order tabs |
| `/yieldboost/[id]` | **Built** | Loop order detail + match form — Community allows partial contribution, P2P takes full order |
| `/hedge` | **Built** | Full order creation; see Hedge section below |
| `/learn` | **Built** | 6 lessons, YouTube embed; nav label is "Learn-to-Earn" |
| `/rewards` | **Built** | Token Rewards content from prototype (no Points, no images) |
| `/resources` | Stub | Link moved to footer |
| `/feedback` | Stub | Link moved to footer |
| `/profile` | Stub | |
| `/notifications` | Stub | |
| `/invite` | Stub | Link in footer |
| `/legal` | **Built** | Full disclaimer from prototype sidebar popup |

---

## Built Pages — Detail

### `/hedge` — Hedge Order Creation

Spec: `app/hedge/CLAUDE.md`

**Files:**
- `app/hedge/page.tsx` — Server component; fetches tiers + prices, renders `HedgeForm`.
- `app/hedge/HedgeForm.tsx` — Client component; full form, calculations, on-chain submit, MySQL write.

**Layout:** `[5fr_3fr]` two-column on desktop (left = form, right = sticky summary); single column mobile.

**On-chain:** Calls `create_order` on `condition_cover` Anchor program (devnet).
- Order PDA seeds: `["order", owner, nonce_le8]`
- Escrow PDA seeds: `["escrow", order_pda]`
- Uses `useAnchorWallet()` + `AnchorProvider` from `@coral-xyz/anchor`
- IDL at `lib/idl/condition_cover.json` — keep in sync with `smartcontracts/target/idl/`

**Post on-chain:** Writes to MySQL `Orders` via `createHedgeOrder` server action.

**SSTM mint:** `lib/orderConstants.ts` `MINT_ADDRESSES.SSTM` = `GzHNybBLLxt7BcAs7ogTmD4m5Wnz8gRkwiHNpFkDY41S` (devnet).

### `/dashboards` — Platform & Risk Dashboards

**Files:**
- `app/dashboards/page.tsx` — Server component; fetches market metrics, renders all sections.
- `app/dashboards/RiskManagement.tsx` — Client component; fetches user stats by wallet on connect.

**Three sections on one page (no tabs):**
1. **Market Metrics** — Cover Supply/Demand, Premiums Earned, Cover Secured, TVL (SSTM + USDC). Single aggregate SQL query. Coverage stored as USD — no token price conversion.
2. **Space Weather** — Kp Forecast, Mid/High-Latitude storm probability grids, Dst card. All values `—` pending MCP integration. Educational tooltips present.
3. **Risk Management** — My Cover Supplied, Offsetting Contracts (Delta Neutral %), Offsetting Orders (pending), Unmitigated Cover at Risk. Filtered by `WalletAddress`. Shows connect prompt if not connected.

### `/yieldboost` — Yield Boost (Delta Neutral Income)

**Files:**
- `app/yieldboost/page.tsx` — Server component; fetches settings, prices, open orders, tiers.
- `app/yieldboost/YieldBoostPage.tsx` — Client component; tabs, forms, matching logic.

**Two tabs:**
1. **Open Orders** (default) — two-column layout:
   - **Community Orders** (left) — pool-based, $2,000 SSTM minimum, 2 loops, longer durations. Displays as a card with progress bar (coverage sought/filled). "Join Pool" button navigates to `/yieldboost/[id]`.
   - **Peer-to-Peer Orders** (right) — direct matching, $50,000 SSTM minimum. Table with Counterparty, Coverage, Loops, Contract, APY, Expires, Match button. "Match" navigates to `/yieldboost/[id]`.
2. **Place P2P Order** — full order form with coverage input ($50k min enforced), loops slider, contract/order duration, yield projections panel.

### `/yieldboost/[id]` — Loop Order Detail + Match

Public detail + match form for a single loop order. Handles both Community pools and Peer-to-Peer orders in one page, with branching UI based on `isCommunityOrder`.

**Files:**
- `app/yieldboost/[id]/page.tsx` — Server component; fetches order via `getLoopOrderById`, settings, prices, tiers.
- `app/yieldboost/[id]/MatchForm.tsx` — Client component; the on-chain match flow (createOrder ×2, createLoopSet, matchOrder ×2, registerLoopContract ×2, MySQL write).

**Flow:**
- **Community:** amount input ($2,000 min, capped at pool remaining) + acknowledgement + "Join Pool". Fills partially; default number of loops from settings.
- **P2P:** shows full order summary, no amount input; takes the entire order on match. Acknowledgement + "Match Order".
- Self-match blocked (own-order detection via connected wallet).
- P2P orders already matched (`OrderTaken=1`) show a notice instead of the form.

This replaces the previous modal-based flow on `/yieldboost` — all match logic now lives on this dedicated URL.

**Key design decisions:**
- Yield Boost is completely separate from Markets. No Yield Boost badges/options on market orders.
- Community orders are seeded by the platform (`IsCommunityOrder = 1`); plan to auto-create new ones when each successive order closes.
- SSTM price is locked at order creation time (`SSTMPriceAtCreation`). Tier calculations use this locked price, not current market price.
- Community Yield Boost uses longer contract durations than Markets to stabilize TVL and justify higher returns.

### `/markets/[id]` — Market Order Detail + Partial-Fill Cover

Public fill page. Any connected wallet can browse and submit Cover against the hedge order displayed here. Linked from `/markets` cards.

**Files:**
- `app/markets/[id]/page.tsx` — Server component; fetches order, tiers, prices.
- `app/markets/[id]/CoverForm.tsx` — Client component; coverage amount input, on-chain submission, partial fills.

**Partial fill flow:**
- User enters coverage amount ($10 minimum, capped at remaining unfilled amount).
- Progress bar shows coverage filled vs. sought.
- "Fill remaining" shortcut link.
- Tier/APY calculated on collective coverage (already filled + new contribution).
- On submit: on-chain `create_order` (Cover type), MySQL `createCoverOrder`, then `updateCoverageFilled`.
- When `CoverageFilled >= Coverage`, order is closed (`OrderTaken = 1, Status = 'Matched'`).

### `/orders/[id]` — My Order Detail (Monitoring)

Owner-only monitoring page. Wallet must match `Orders.WalletAddress` or the page 404s. Linked from `/orders` rows (all rows are clickable — both Hedge and Cover).

**Files:**
- `app/orders/[id]/page.tsx` — Client component; fetches via `getMyOrderById`, shows order details, fills, cancel action.

**Sections:**
- Header with Type badge + Status badge + condition
- `OrderDetailsGrid` (shared component)
- Fill Progress bar (Hedge only)
- Matched Contracts table (Hedge only, each row links to `/contracts/[id]`)
- Linked Hedge Order card (Cover only, links to `/markets/[id]`)
- `SettlementExplainer` (shared)
- `OnChainRefs` (shared — wallet, order address, mint)
- Action panel with Cancel Order button (only if Status=Open and `CoverageFilled=0`)

**Cancel behavior:** DB-only today — flips `Status='Cancelled'`. TODO: add on-chain `cancel_order` + escrow refund once the `condition_cover` instruction lands. See `cancelOrder.ts`.

### `/contracts/[id]` — My Contract Detail

Owner-only (must be Hedge or Cover party). Linked from `/contracts` rows.

**Files:**
- `app/contracts/[id]/page.tsx` — Client component; fetches via `getContractById`.

**Sections:** role/outcome header, contract details grid, Parties card (you highlighted), Linked Orders (user's own linked to `/orders/[id]`), settlement explainer, on-chain refs.

### `/rewards`
Token Rewards section from prototype. Tier table (Tiers 1–5, 7–17% APY). No Points. No images.

### `/legal`
Full legal disclaimer from prototype sidebar popup. All sections: General, No Advice, Representation & Warranties, Solicitation, Restricted Jurisdictions, No Offer of Securities, Privacy Policy, Forward-Looking Statements.

---

## Server Actions (`app/_actions/`)

| File | Purpose |
|---|---|
| `testDb.ts` | DB connection test |
| `prices.ts` | Jupiter Price API v6 for SOL/USDC/LINK; SSTM hardcoded at $9.024; 60 s in-memory cache; falls back to hardcoded constants |
| `getTiers.ts` | Reads `Tiers` table. **Only `async` exports allowed** (`'use server'` constraint) |
| `createHedgeOrder.ts` | Inserts Hedge row into `Orders`; records `SSTMPriceAtCreation` |
| `createCoverOrder.ts` | Inserts Cover row into `Orders`; links via `MatchingOrderID`; records `SSTMPriceAtCreation` |
| `createLoopOrder.ts` | Inserts P2P Yield Boost loop order; records `SSTMPriceAtCreation` |
| `createCommunityOrder.ts` | Seeds a Community Yield Boost pool order (`IsCommunityOrder = 1`) |
| `updateCoverageFilled.ts` | Increments `CoverageFilled` on a hedge order; closes it when fully filled |
| `getOpenHedgeOrders.ts` | Fetches open hedge orders for Markets; supports filters; includes `coverageFilled` |
| `getOrderById.ts` | Public single hedge order fetch for `/markets/[id]` fill page (Hedge-only, excludes loop orders) |
| `getMyOrderById.ts` | Owner-scoped single order fetch for `/orders/[id]`; enforces `WalletAddress` match (404 otherwise) |
| `getOrderFills.ts` | Lists Cover orders filling a given Hedge order; joins to `Contracts` for contract id/address |
| `getUserOrders.ts` | All orders placed by a wallet — drives `/orders` (My Orders) list |
| `getUserContracts.ts` | Contracts where wallet is Hedge or Cover party — drives `/contracts` (My Contracts) list |
| `getContractById.ts` | Owner-scoped single contract fetch for `/contracts/[id]`; enforces wallet is party |
| `cancelOrder.ts` | Flips `Status='Cancelled'` in DB. Only allowed if `Status=Open`, `CoverageFilled=0`, `OrderTaken=0`, wallet matches. TODO: add on-chain cancel + escrow refund. |
| `getOpenLoopOrders.ts` | Fetches open Yield Boost orders; returns `isCommunityOrder`, `coverageSought`, `coverageFilled` |
| `getLoopOrderById.ts` | Single loop order fetch for `/yieldboost/[id]` (Community or P2P); includes `status`, `orderTaken` |
| `getLoopSettings.ts` | Reads looping config from `VariableSettings` (APY, LTV, fees, max loops) |
| `matchLoopOrder.ts` | Records P2P loop match in MySQL (LoopSets + contract pairs) |
| `getHomePageData.ts` | Order-matching queries for homepage featured opportunities (retained, not currently used) |
| `getDashboardMetrics.ts` | `getMarketMetrics()` — platform aggregate. `getUserRiskMetrics(walletAddress)` — user-specific risk stats |

**Rule:** Every export from a `'use server'` file must be `async`. Pure helpers go in `lib/`.

---

## Library Files (`lib/`)

| File | Purpose |
|---|---|
| `db.ts` | mysql2 connection pool |
| `auth.ts` | better-auth server config; `kycVerified` defaults to `true` for dev — flip to `false` pre-launch |
| `auth-client.ts` | `useSession`, `signIn`, `signOut`, `signUp` |
| `utils.ts` | `cn()` (clsx + tailwind-merge) |
| `orderConstants.ts` | Payout conditions, annual odds, fixed-point encoding, mint addresses, program ID, contract durations, `matchTier()` |
| `orderFormat.ts` | Shared formatters: `shortIndex`, `longIndex`, `formatCondition`, `formatCoverage`, `shortId`, `shortWallet`, `formatCreated`, `timeRemaining`, explorer URL helpers |
| `idl/condition_cover.json` | Anchor IDL copy — keep in sync with `smartcontracts/target/idl/condition_cover.json` |

---

## Folder Conventions (to be established)

### Carry Over from Prototype (similar implementation)
These routes exist in the prototype at `C:\Users\jim-f\source\repos\next-js` and should be ported with minimal changes. Use the prototype as the UX and logic reference.

| Route | Purpose |
|---|---|
| `/feedback` | User feedback form with UX, Features, Videos, iBubbles rating scores. Maps to `Feedback` MySQL table. |
| `/invite` | Referral/invite system for growing the user network. |
| `/learn` | Educational video content — intro to ConditionCover, space weather risk, creating orders, risk sharing. |
| `/resources` | Help documentation and reference materials. |
| `/rewards` | SSTM token rewards and points system display. Maps to rewards fields in `Orders` table (`TokenReward`, `PointsReward`, `CoverRewardAPY`). |

---

### Must Be Built (no prototype equivalent)

| Route | Purpose | Notes |
|---|---|---|
| `/notifications` | User alerts for contract events, settlement, order matching | Replaces prototype stub |
| `/profile` | User profile, wallet connection, account settings | Must integrate Solana wallet (replaces Cognito profile) |

> **Note:** Looping/offset order functionality has been merged into `/yieldboost`. There is no separate `/looping` route.

---

### Being Revamped Entirely

| Route | What changes |
|---|---|
| `/contracts` | Prototype used DynamoDB + AppSync. Rebuild reads from MySQL `Contracts` table and reflects live Solana on-chain contract state. Settlement is automatic via Chainlink oracle — UI must surface oracle check count (`OracleChecks`) and contract address (`ContractAddress`). |
| `/orders` | Full rework to support Solana wallet signing, USDC/SSTM denomination selection, MOS/MicroMOS configuration, and Chainlink oracle gas (LINK). Maps to MySQL `Orders` table. Payout probability driven by `IndexProbabilities` table. |

---

## Key Integration Points

### MySQL Database
- All data reads/writes go to MySQL (replacing DynamoDB/AppSync).
- Table reference: see `mysql_schema.docx` at the repo root.
- Server Actions (in `app/_actions/`) should handle DB access server-side.

### Solana Wallet
- Auth and identity are tied to a Solana wallet (replacing AWS Cognito).
- `WalletAddress` on the `Orders` and `Contracts` tables is the primary user identifier.
- Wallet adapter: `@solana/wallet-adapter-react` with Phantom adapter. Configured in `components/wallet-provider.tsx`.
- Currently targeting **Solana devnet**. Wallet dropdown shows "Solana Devnet" label.
- Program ID: `5PkPCbdZNFGYVJNjifxgZDGyeaMKmTeWPj4fxhYeeB9K`
- SSTM Mint: `GzHNybBLLxt7BcAs7ogTmD4m5Wnz8gRkwiHNpFkDY41S` (defined in `lib/orderConstants.ts`)

### Chainlink Oracle
- Contract settlement is automatic — the frontend does not trigger settlement.
- UI should display: oracle check interval, `OracleChecks` count, index threshold (`IndexLevel`), and final `ContractOutcome`.

### Space Weather Data
- Index values (Kp, Dst, etc.) displayed on the orders/contracts UI come from the NOAA SWPC MCP server.
- MCP server path: `C:\Users\jim-f\source\repos\space_weather_data_mcp`
- Do not call NOAA directly from the browser — proxy through a server action or API route.

### Tokens
- **USDC** — stablecoin denomination for coverage and premiums
- **SSTM** — platform token; rewards and optional denomination
- **SOL** — Solana gas (`GasFeeLayer1`)
- **LINK** — Chainlink oracle gas (`GasFeeOracle`)
- Currency conversion constants were in `app/_actions/currency.ts` in the prototype.

---

## Prototype Reference

Full prototype: `C:\Users\jim-f\source\repos\next-js`

Useful files to reference when porting:
- `app/_actions/` — server-side logic (currency conversions, data fetching)
- `app/_actions/currency.ts` — SOL, SSTM, USDC, LINK exchange rate constants
- `amplify/data/resource.ts` — original field names (now in `mysql_schema.docx`)
- `components/ui/` — Radix UI components (button, dialog, table, etc.) — may be reused
- `app/(navbars)/page.tsx` — main dashboard (23KB, rich reference for layout)

---

## Folder Conventions (to be established)

```
website/
├── app/
│   ├── _actions/           ← server actions (DB access, oracle data proxy)
│   ├── (auth)/             ← wallet-gated layout group (TBD)
│   ├── contracts/
│   ├── feedback/
│   ├── invite/
│   ├── learn/
│   ├── notifications/
│   ├── orders/
│   ├── profile/
│   ├── resources/
│   ├── rewards/
│   ├── layout.tsx
│   ├── page.tsx            ← dashboard / home
│   └── globals.css
├── components/
│   ├── ui/                 ← primitive UI components
│   ├── order/              ← shared order/contract display (OrderDetailsGrid, SettlementExplainer, OnChainRefs)
│   ├── nav.tsx             ← top navigation (auth-state-aware)
│   ├── theme-provider.tsx  ← next-themes wrapper
│   ├── theme-toggle.tsx    ← light/dark toggle button
│   ├── tooltip.tsx         ← hover tooltip primitive
│   └── wallet-provider.tsx ← Solana wallet adapter wrapper
├── lib/
│   ├── auth.ts             ← Better Auth server config
│   ├── auth-client.ts      ← Better Auth browser client (useSession, signIn, signOut)
│   ├── db.ts               ← mysql2 connection pool
│   └── utils.ts            ← cn() helper (clsx + tailwind-merge)
└── public/
```

---

## Authentication & Access Flow

### Library
**Better Auth** (`better-auth`) — self-hosted, App Router native, MySQL adapter built-in.

### Key Files
| File | Purpose |
|---|---|
| `lib/auth.ts` | Server-side auth config — email/password, custom user fields |
| `lib/auth-client.ts` | Browser client — exports `useSession`, `signIn`, `signOut`, `signUp` |
| `app/api/auth/[...all]/route.ts` | Better Auth catch-all API handler |

### Custom User Fields
Better Auth's `user` table is extended with two fields:

| Field | Type | Default | Set by |
|---|---|---|---|
| `kycVerified` | boolean | `false` | KYC/AML webhook (third-party) — never by user input |
| `walletAddress` | string (nullable) | `null` | Server action after Phantom wallet connection is confirmed |

### Access States

The site is publicly browsable. Gated features depend on the user's combined login + KYC + wallet state:

| State | Login | KYC | Wallet | Access |
|---|---|---|---|---|
| 1 — Guest | ✗ | — | — | Browse only. No profile dropdown, no wallet button. |
| 2 — Logged in, unverified | ✓ | ✗ | — | Profile dropdown visible. Connect Wallet shown but **disabled** with tooltip: *"Complete identity verification to connect a wallet"*. |
| 3 — Logged in, KYC verified | ✓ | ✓ | ✗ | Connect Wallet button becomes active. |
| 4 — Logged in, KYC verified, wallet connected | ✓ | ✓ | ✓ | Full access. Truncated wallet address replaces Connect Wallet button. Orders can be created. |

### Nav Button Logic (components/nav.tsx)
```
isLoggedIn = !!session
kycVerified = session?.user?.kycVerified ?? false

Not logged in  → Login button only
Logged in      → Profile dropdown + wallet button:
  connected         → address pill (click to disconnect)
  !connected + KYC  → active Connect Wallet
  !connected - KYC  → disabled Connect Wallet + tooltip
```

### Rationale for Hiding Wallet Until Login + KYC
- KYC/AML compliance is tied to the user account, not the wallet. A wallet alone proves no identity.
- Forces the correct onboarding sequence: **Register → Login → KYC/AML → Connect Wallet → Trade**.
- Prevents anonymous wallet associations, simplifying the compliance audit trail.

### DB Tables Created by Better Auth (via migrate)
`user`, `session`, `account`, `verification` — all managed by Better Auth. Do not edit these manually. Re-run `npx @better-auth/cli migrate --config lib/auth.ts` after any change to `lib/auth.ts`.

### Environment Variables Required
```
BETTER_AUTH_SECRET=<random 32+ byte secret>
BETTER_AUTH_URL=http://localhost:3000          # server-side
NEXT_PUBLIC_BETTER_AUTH_URL=http://localhost:3000  # client-side
```
