# ConditionCover — Website (Next.js Frontend)

## Stack

- **Next.js 16.1.6** (App Router)
- **React 19**
- **TypeScript 5** (strict mode)
- **Tailwind CSS 4** (via `@tailwindcss/postcss`)
- **ESLint 9** (`eslint-config-next`)
- Path alias: `@/*` → project root

No UI component library has been added yet (prototype used Radix UI — to be decided).
No `components/` or `lib/` directories exist yet.

---

## Navigation & Layout

The prototype used a **side navigation menu**. This has been replaced with a **top navigation bar** — there is no sidebar in the rebuild. All routes are accessed from the top nav.

---

## Homepage — Opportunity Cards

The homepage (`app/page.tsx`) is not a dashboard — it is a **market opportunity page** displaying a set of cards representing available positions. These are not live contracts but curated entry points that route the user into the order creation flow.

**Market summary bar** sits above the cards showing live platform totals:
- `Cover Supplied` — total USD value of active cover orders
- `Cover Sought` — total USD value of active hedge orders

The page has two visual sections:
- **"Earn Income by supplying cover using SSTM Token"** — Cover order cards (blue/purple)
- **"Secure Cover Against Environmental Risk using SSTM Token"** — Hedge order card (green/yellow)

---

### Card Anatomy (from mock-up)

Each card displays:
- **Order type label** — "Supply Cover" or "Seeking Cover"
- **Amount** — fixed dollar amount or "Enter Amount" free-form input
- **SSTM Reward APY** — current or projected yield (green); shows `--%` when calculated on entry
- **Premium Earned / Premium %** — fractional token premium (green)
- **Contract Length** — days
- **Risk of Cover Payout / Probability of Cover Payout** — annual payout probability (red)
- **Option checkboxes** — vary by card (see per-card details below)
- **Countdown timer** — "Risk Sharing Offer Expires in DD:HH:MM:SS" (purple badge) — shown on time-limited offers
- **CTA button** — "Review / Customize Order"

Color coding:
- Green — income/reward values (APY, premium earned)
- Red — risk values (payout probability)
- Purple badge — countdown timer on expiring offers

---

### The Five Cards

**Card 1 — Maximum Tier Cover (fixed amount)**
- Type: Supply Cover
- Amount: pre-filled (e.g. $1,000,000) — the amount needed to reach the maximum SSTM reward tier
- SSTM Reward APY: maximum tier rate (e.g. 17%), labeled "(Max 17%)"
- Options: Offset Risk checkbox, Offset Yield Boost checkbox ("Up to 8%")
- Countdown timer: shown (time-limited risk-sharing offer)
- Purpose: one-click entry for users who want maximum APY by supplying the full top-tier amount

**Card 2 — Next Tier Cover (fixed amount)**
- Type: Supply Cover
- Amount: pre-filled — the incremental amount needed to reach the *next* rewards tier from the user's current position
- SSTM Reward APY: next tier rate (e.g. 10%), labeled "(Max 17%)"
- Options: Offset Risk checkbox, Offset Yield Boost checkbox ("Up to 8%")
- Countdown timer: shown
- Purpose: personalised nudge showing exactly how much more coverage earns the user a tier upgrade

**Card 3 — Free Form Cover**
- Type: Supply Cover
- Amount: "Enter Amount" free-form input
- SSTM Reward APY: calculated dynamically based on entered amount and current tier (`---%` until entered)
- Options: Reduce Risk Option checkbox, Yield Amplifier Option checkbox
- No countdown timer
- Purpose: flexible entry for any cover amount; system finds the best matching APY tier

**Card 4 — Delta Neutral (One-Click)**
- Type: Supply Cover (with simultaneous Hedge)
- Amount: pre-filled — matches an existing open opportunity (e.g. $150,000)
- SSTM Reward APY: full looping tier rate (e.g. 10%)
- Options: Offset Risk checkbox, Offset Yield Boost checkbox ("Up to 8%")
- Countdown timer: shown
- Purpose: creates (or matches) both a Cover order and a Hedge order with identical parameters in one action, resulting in a delta-neutral position with zero net risk; qualifies user for full looping APY tier rewards. Looping management handled within `/yieldboost`.

**Card 5 — Free Form Hedge**
- Type: Seeking Cover (Hedge order)
- Amount: "Enter Amount" free-form input
- Premium %: shown (e.g. 1.2%)
- Contract Length: shown
- Cover Payout Trigger: the index threshold displayed as a clickable link (e.g. "DST > -800nT")
- Probability of Cover Payout: annual probability (red)
- Cost to Enter: "Calculated" — computed from entered amount and current oracle gas fees
- No countdown timer, no offset checkboxes
- Background color: green/yellow (visually distinct from cover cards)
- Purpose: free-form hedge entry; user specifies dollar amount and system calculates cost and trigger

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
- Wallet adapter library TBD (standard choice: `@solana/wallet-adapter-react`).

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
