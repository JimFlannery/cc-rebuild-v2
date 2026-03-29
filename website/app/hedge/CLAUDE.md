# Hedge Page — `/hedge`

## Purpose

Order creation page for **Hedge orders only**. A Hedge order buys protection against a space weather event: the user pays a premium and receives a payout if the chosen index crosses the threshold during the contract period.

This page is the rebuild equivalent of the prototype's `/orders/new` page, with the following deliberate removals:
- No Cover order creation (Cover orders are created elsewhere or auto-matched)
- No Risk Sharing / MOS option
- No Additional Oracle Checks option
- No Points Benefits display

Successful submission creates an **escrowed on-chain order** on Solana devnet via the `create_order` instruction in the `condition_cover` Anchor program.

---

## Layout

Two-column grid (5 cols left, 3 cols right) on desktop; single column stacked on mobile.

**Left panel — Form inputs (Sections 1 & 2)**
**Right panel — Order summary + submission (Section 3)**

---

## Section 1 — Order Parameters

### Fields

| Field | Type | Options | Notes |
|---|---|---|---|
| Order Timing | Radio | Real-Time Market / Committed | |
| Order Duration | Dropdown | 1–90 days | Only shown when Committed is selected |
| Contract Currency | Radio | SSTM / USDC | Shows current spot price next to each option |
| Space Weather Index | Dropdown | Disturbance Storm Time (Dst) / Planetary K-Index (Kp) | |
| Payout Condition | Dropdown | Varies by index — see below | |
| Contract Duration | Dropdown | 2, 4, 6, 8, 10, 30, 60, 90, 180, 365 days | |
| Coverage Sought | Number input | $0–$10,000,000,000, integers only | Dollar amount of payout if event occurs |

#### Payout Condition options by index

**Dst (Disturbance Storm Time):**
- Dst < -400 nT
- Dst < -600 nT
- Dst < -850 nT

**Kp (Planetary K-Index):**
- Kp ≥ 6
- Kp ≥ 7
- Kp ≥ 8
- Kp ≥ 9

### Order Timing behaviour
- **Real-Time Market**: order is submitted immediately and waits to be matched on-chain. No expiration date.
- **Committed**: order has a fixed expiration window (Order Duration days from submission). If unmatched at expiration, escrow is returned. Shows formatted expiration date in summary.

---

## Section 2 — Optional Features

### Hedge Premium Adjustment
- Toggle (off by default)
- When enabled: numeric input, range 0.05 × to 5.0 ×, default 1.0 ×
- Multiplies the base hedge premium to adjust market pricing up or down
- Popover help explaining the multiplier effect

---

## Section 3 — Order Summary (Right Panel)

### Math Summary Panel (collapsible)

The detailed math is **hidden by default** and revealed by clicking an expand toggle ("Show calculation details" / "Hide calculation details"). The summary always shows the key output values regardless of expansion state.

#### Always-visible summary
- Coverage Sought: `$[coverage]`
- Premium to Pay: `[adjustedHedgePremium] [token]` + USD equivalent
- Contract Duration: `[duration] days`
- Payout Trigger: `[indexName] [condition]`
- Probability of Payout: `[payoutProbability]%`

#### Expandable detail rows (hidden by default)

| Label | Value | Notes |
|---|---|---|
| Annual Payout Odds | `[indexLevelOdds × 100]%` | From probability lookup table |
| Base Hedge Premium | `[hedgePremium] [token]` | coverage × payoutProbability |
| Premium Adjustment | `× [hedgePremiumAdjustment]` | Only shown when adjustment enabled |
| Adjusted Premium | `[adjustedHedgePremium] [token]` | |
| Service Fee | `[contractServiceFee] [token]` | Tier-based % of adjusted premium |
| Layer 1 Gas | `[layer1Fees] [token]` | SOL equivalent shown |
| Total Cost | `[totalCost] [token]` | adjusted premium + all fees |
| Order Expiration | `[formattedOrderExpirationDate]` | Committed orders only |

Color coding: premium/cost values in foreground; probability values in red (risk indicator).

---

## Calculations

### Payout Probability Lookup (OddsYear — annual odds)

| Index Level | Annual Odds |
|---|---|
| Dst < -400 nT | 0.05 (5%) |
| Dst < -600 nT | 0.0167 (1.67%) |
| Dst < -850 nT | 0.012 (1.2%) |
| Kp ≥ 6 | 154.54 days/year |
| Kp ≥ 7 | 54.54 days/year |
| Kp ≥ 8 | 9.09 days/year |
| Kp ≥ 9 | 0.3636 days/year |

> Kp values represent expected days per year the index is at or above that level; payout probability scales proportionally with duration.

### Payout Probability (for display)
```
payoutProbability = indexLevelOdds × (duration / 365)
display: (payoutProbability × 100).toFixed(2) + "%"
```

### Hedge Premium
```
hedgePremium = coverage × payoutProbability
adjustedHedgePremium = hedgePremium × hedgePremiumAdjustment
```

### Service Fee (Tier-based on coverage amount)

Tier boundaries and fee rates are read from the MySQL **`Tiers`** table at page load via a server action — do not hardcode them. The table is the single source of truth.

Fetch via `app/_actions/getTiers.ts` and pass to the client component as a prop. Cache the result for the session (tiers change infrequently).

The tier is determined by matching `coverage` against the coverage range columns in `Tiers`. The applicable fee percentage is the SSTM or USDC fee column depending on the selected denomination.

```
contractServiceFee = adjustedHedgePremium × tier_fee_pct
```

### Gas Fees
```
layer1Fees = $0.10 (Market) or $0.15 (Committed)  [displayed as SOL equivalent]
```
No oracle fee line (additional oracle checks removed).

### Total Cost
```
totalCost = adjustedHedgePremium + contractServiceFee + layer1Fees
```

### On-chain index_level encoding
The `create_order` instruction stores `index_level` as fixed-point ×100 (`i64`):
- Dst -400 nT → `-40000`
- Dst -600 nT → `-60000`
- Dst -850 nT → `-85000`
- Kp 6 → `600`
- Kp 7 → `700`
- Kp 8 → `800`
- Kp 9 → `900`

---

## Validation

All fields required before submission:
- Order Timing selected
- Order Duration selected (if Committed)
- Contract Currency selected
- Space Weather Index selected
- Payout Condition selected
- Contract Duration selected
- Coverage > 0
- Acknowledgement checkbox checked

Invalid fields highlighted with red ring. "Complete form to continue" message shown until all valid.

---

## Submission Flow

### Pre-submission
1. Validate all fields — show field-level errors if incomplete.
2. Display confirmation popover showing key terms (coverage, premium, trigger, duration).
3. User confirms → proceed.

### On-chain transaction (devnet)
Calls `create_order` on the `condition_cover` Anchor program:

```typescript
program.methods.createOrder(
  nonce,              // u64 — client-generated (e.g. Date.now())
  { hedge: {} },      // OrderType::Hedge
  indexNameAnchor,    // e.g. { dst: {} } — from INDEX_NAME_TO_ANCHOR map
  indexLevelEncoded,  // i64 fixed-point ×100
  new BN(coverage),   // u64 — coverage amount in token base units
  new BN(premiumBaseUnits), // u64 — adjusted premium in token base units
  new BN(expirationUnix),   // i64 — Unix timestamp (or far future for Market orders)
  denominationAnchor, // { usdc: {} } or { sstm: {} }
)
```

Required accounts: `order` (PDA), `escrow` (PDA token account), `ownerTokenAccount`, `mint`, `owner` (wallet signer), `tokenProgram`, `systemProgram`.

### Post-submission
- On success: show success banner with transaction signature linking to Solana Explorer (devnet).
- Write order to MySQL `Orders` table via server action (mirrors on-chain state for the website frontend).
- Clear form.
- User stays on page.

### On-chain failure handling
- Insufficient token balance → show specific message.
- Wallet not connected → prompt to connect.
- Transaction rejected → show error with retry option.

---

## Token Price Feeds

### Recommendation: Jupiter Price API (primary) + hardcoded SSTM (temporary)

**For SOL, LINK, USDC:** Use the [Jupiter Price API](https://price.jup.ag/v6/price) — free, no API key, real-time aggregated DEX prices for any Solana token by mint address. Fetch server-side in a Server Action and cache for 60 seconds to avoid hammering the endpoint.

```
GET https://price.jup.ag/v6/price?ids=So11111111111111111111111111111111111111112,EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
```

**For SSTM:** Hardcoded price constant until SSTM is listed on a Solana DEX (Raydium/Orca). Once listed, Jupiter will automatically pick it up by mint address — swap the hardcode for a Jupiter lookup with no other code change needed.

**Hardcoded fallback constants** (from prototype `currency.ts`, for devnet):
```typescript
export const TOKEN_PRICES = {
  SSTM: 9.024301397,   // hardcoded until listed on DEX
  SOL:  126.961894378, // replaced by Jupiter in production
  USDC: 0.999999,      // replaced by Jupiter in production
  LINK: 14.01404657,   // replaced by Jupiter in production
};
```

**Implementation:** `app/_actions/prices.ts` server action — tries Jupiter first, falls back to constants if the request fails. The page calls this action on load and re-fetches every 60 seconds.

**Future (mainnet):** Chainlink Price Feeds (SOL/USD, LINK/USD) via the `chainlink_solana` crate already in the stack. Custom SSTM feed added once the token is launched and a Chainlink feed is established.

---

## MySQL Write (after on-chain success)

Write to `Orders` table:
```
OrderType         = 'Hedge'
Status            = 'Open'
OrderTiming       = 'Market' | 'Committed'
OrderDuration     = null | days
Expiration        = ISO timestamp | null
Denomination      = 'SSTM' | 'USDC'
Duration          = days
OracleChecks      = 1   (fixed — no additional oracle checks option)
IndexName         = 'Dst' | 'Kp'
IndexLevel        = threshold value (human-readable, e.g. -400)
PayoutProbability = calculated decimal
Coverage          = dollar amount
HedgePremium      = base premium
AdjustedHedgePremium = premium after adjustment
HedgePremiumAdjustment = multiplier
GasFeeLayer1      = SOL amount
ServiceFee        = fee amount
WalletAddress     = connected wallet pubkey
OrderAddress      = on-chain Order PDA pubkey
DenominationAddress = token mint address
MOS               = 0  (always — no risk sharing)
```

---

## Files to Create

| File | Purpose |
|---|---|
| `app/hedge/page.tsx` | Page component (already exists as stub) |
| `app/_actions/createHedgeOrder.ts` | Server action — writes to MySQL after on-chain success |
| `app/_actions/prices.ts` | Server action — fetches token prices from Jupiter with hardcoded fallback |
| `app/_actions/getTiers.ts` | Server action — reads tier boundaries and fee rates from MySQL `Tiers` table |
| `lib/orderConstants.ts` | OddsYear table, INDEX_NAME_TO_ANCHOR re-export, fixed-point encoding |
