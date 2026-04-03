import Link from "next/link";
import { getTiers } from "./_actions/getTiers";
import { getTokenPrices } from "./_actions/prices";
import { getMarketMetrics } from "./_actions/getDashboardMetrics";
import { findBestMatchingOrder, findYieldBoostOrder } from "./_actions/getHomePageData";
import { matchTier } from "@/lib/orderConstants";
import { FreeFormCoverCard, FreeFormHedgeCard } from "./HomeCards";

export const metadata = { title: "ConditionCover — Space Weather Risk Marketplace" };

function usd(n: number, decimals = 0) {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}

export default async function Home() {
  const [tiers, prices, metrics, maxTierOrder, yieldBoostOrder] = await Promise.all([
    getTiers(),
    getTokenPrices(),
    getMarketMetrics(),
    // Card 1: look for a $1M SSTM order (max tier threshold)
    findBestMatchingOrder("SSTM", 1_000_000),
    // Card 4: any yield-boost-eligible order
    findYieldBoostOrder(),
  ]);

  // Tier helpers
  const maxTier   = tiers.length > 0 ? tiers[tiers.length - 1] : null;
  const maxApy    = maxTier?.APY ?? 0;
  const maxAmount = maxTier?.TotalStart ?? 1_000_000;

  // Card 1 link — exact match → /orders/[id]; otherwise /markets with filters
  const card1Href = maxTierOrder
    ? `/orders/${maxTierOrder.id}`
    : `/markets?denom=SSTM&minCov=${Math.floor(maxAmount * 0.9)}`;

  // Card 4 link — any yield-boost order
  const card4Href = yieldBoostOrder
    ? `/orders/${yieldBoostOrder.id}`
    : "/markets?denom=SSTM";
  const card4Amount = yieldBoostOrder?.coverage ?? 150_000;
  const card4Tier   = matchTier(tiers, card4Amount);
  const card4Apy    = card4Tier?.APY ?? 0;
  const card4Prob   = yieldBoostOrder?.payoutProbability ?? 0.012;
  const card4Premium = yieldBoostOrder?.adjustedHedgePremium ?? card4Amount * 0.012;

  return (
    <main className="mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 py-8 space-y-8">

      {/* ── Market summary bar ──────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card px-6 py-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
        <SummaryMetric label="Cover Supplied" value={usd(Number(metrics.coverSupply))} sub={`${metrics.coverSupplyCount} orders`} />
        <SummaryMetric label="Cover Sought" value={usd(Number(metrics.coverDemand))} sub={`${metrics.coverDemandCount} orders`} />
        <SummaryMetric label="Premiums Earned" value={usd(Number(metrics.premiumsEarned), 2)} />
        <SummaryMetric label="Cover Secured" value={usd(Number(metrics.coverSecured))} />
      </div>

      {/* ── Section 1: Earn Income ───────────────────────────────────────────── */}
      <section>
        <h2 className="text-lg font-semibold mb-1">
          Earn Income by Supplying Cover using SSTM Token
        </h2>
        <p className="text-sm text-muted-foreground mb-4">
          Lock SSTM tokens as coverage. Collect premiums upfront and earn SSTM rewards.
          You absorb the loss only if a rare space weather event occurs.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">

          {/* Card 1 — Maximum Tier Cover */}
          <StaticCoverCard
            href={card1Href}
            badge="Max Tier"
            badgeClass="text-purple-600 dark:text-purple-400"
            amount={usd(maxAmount)}
            apy={maxApy}
            apyLabel={`(Max ${(maxApy * 100).toFixed(0)}%)`}
            duration="90 days"
            prob="1.2% / yr"
            showTimer
            options={[
              { id: "c1-risk", label: "Offset Risk" },
              { id: "c1-boost", label: `Offset Yield Boost (Up to 8%)` },
            ]}
          />

          {/* Card 2 — Next Tier Cover (wallet-dependent; simplified placeholder) */}
          <StaticCoverCard
            href="/markets?denom=SSTM"
            badge="Next Tier"
            badgeClass="text-blue-500"
            amount="Connect wallet"
            apy={tiers[1]?.APY ?? 0}
            apyLabel={`(Max ${(maxApy * 100).toFixed(0)}%)`}
            duration="Your choice"
            prob="1.2% / yr"
            showTimer
            note="Connect your wallet to see your personalised next-tier amount."
            options={[
              { id: "c2-risk", label: "Offset Risk" },
              { id: "c2-boost", label: "Offset Yield Boost (Up to 8%)" },
            ]}
          />

          {/* Card 3 — Free Form Cover (client) */}
          <FreeFormCoverCard tiers={tiers} />

          {/* Card 4 — Delta Neutral */}
          <StaticCoverCard
            href={card4Href}
            badge="Delta Neutral ✦"
            badgeClass="text-amber-600 dark:text-amber-400"
            amount={usd(card4Amount)}
            apy={card4Apy}
            duration="90 days"
            prob={`${(card4Prob * 100).toFixed(2)}% / yr`}
            premium={`$${card4Premium.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            showTimer
            options={[
              { id: "c4-risk", label: "Offset Risk" },
              { id: "c4-boost", label: "Offset Yield Boost (Up to 8%)" },
            ]}
          />
        </div>
      </section>

      {/* ── Section 2: Secure Cover ─────────────────────────────────────────── */}
      <section>
        <h2 className="text-lg font-semibold mb-1">
          Secure Cover Against Environmental Risk using SSTM Token
        </h2>
        <p className="text-sm text-muted-foreground mb-4">
          Pay a small premium to receive a large payout if a rare geomagnetic event occurs.
          Ideal for businesses with satellite, grid, or infrastructure exposure.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {/* Card 5 — Free Form Hedge (client) */}
          <FreeFormHedgeCard />

          {/* Informational tile */}
          <div className="rounded-xl border border-amber-400/40 bg-amber-50/20 dark:bg-amber-950/10 px-5 py-5 flex flex-col justify-between">
            <div className="space-y-3">
              <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wide">
                How Hedging Works
              </p>
              <ul className="space-y-2 text-xs text-muted-foreground list-disc list-inside">
                <li>Choose a space weather index and threshold (e.g. Dst &lt; -850 nT)</li>
                <li>Pay a small upfront premium (≈ 1–5% of coverage)</li>
                <li>If the event occurs, you receive the full coverage amount</li>
                <li>Settlement is automatic via Chainlink oracle + NOAA data</li>
              </ul>
            </div>
            <Link
              href="/learn"
              className="mt-4 text-xs font-semibold text-primary hover:underline"
            >
              Learn more in Learn-to-Earn →
            </Link>
          </div>

          {/* Market stats tile */}
          <div className="rounded-xl border border-border bg-card px-5 py-5 flex flex-col gap-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Platform Stats
            </p>
            <PlatformStat label="TVL (SSTM orders)" value={usd(Number(metrics.tvlSstm))} />
            <PlatformStat label="TVL (USDC orders)" value={usd(Number(metrics.tvlUsdc))} />
            <PlatformStat label="Total Income Earned" value={usd(Number(metrics.totalIncomeEarned), 2)} />
            <PlatformStat label="SSTM Price" value={`$${prices.SSTM.toFixed(4)}`} />
            <div className="pt-2 border-t border-border">
              <Link href="/markets" className="text-xs text-primary hover:underline font-medium">
                View all open orders →
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

// ── Static Cover Card ─────────────────────────────────────────────────────────

function StaticCoverCard({
  href, badge, badgeClass, amount, apy, apyLabel, duration, prob, premium, showTimer, note, options,
}: {
  href: string;
  badge: string;
  badgeClass?: string;
  amount: string;
  apy: number;
  apyLabel?: string;
  duration: string;
  prob: string;
  premium?: string;
  showTimer?: boolean;
  note?: string;
  options?: { id: string; label: string }[];
}) {
  return (
    <div className="rounded-xl border border-border bg-card flex flex-col h-full">
      {/* Header */}
      <div className="rounded-t-xl bg-gray-100 dark:bg-gray-800 px-4 py-2.5 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Supply Cover
        </span>
        <span className={`text-xs font-medium ${badgeClass ?? ""}`}>{badge}</span>
      </div>

      <div className="flex flex-col gap-3 px-4 py-3 flex-1">
        {showTimer && (
          <div className="rounded-md bg-purple-100 dark:bg-purple-950/40 border border-purple-300/50 px-2 py-1 text-xs text-purple-700 dark:text-purple-300 text-center font-medium">
            Risk Sharing Offer — Limited Time
          </div>
        )}

        <div>
          <p className="text-xs text-muted-foreground">Coverage Amount</p>
          <p className="text-sm font-semibold">{amount}</p>
        </div>

        <CardStatRow
          label="SSTM Reward APY"
          value={apy > 0 ? `${(apy * 100).toFixed(1)}%` : "---%"}
          sub={apyLabel}
          valueClass="text-green-600 dark:text-green-400"
        />
        {premium && (
          <CardStatRow label="Premium Earned" value={premium} valueClass="text-green-600 dark:text-green-400" />
        )}
        <CardStatRow label="Contract Length" value={duration} />
        <CardStatRow label="Risk of Cover Payout" value={prob} valueClass="text-red-500" />

        {note && <p className="text-xs text-muted-foreground italic">{note}</p>}

        {options?.map((o) => (
          <div key={o.id} className="flex items-center gap-2 text-xs text-muted-foreground">
            <input type="checkbox" id={o.id} className="accent-primary" />
            <label htmlFor={o.id}>{o.label}</label>
          </div>
        ))}
      </div>

      <div className="px-4 pb-4">
        <Link
          href={href}
          className="block w-full text-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
        >
          Review / Customize Order
        </Link>
      </div>
    </div>
  );
}

// ── Small helpers ─────────────────────────────────────────────────────────────

function SummaryMetric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-base font-semibold">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

function PlatformStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function CardStatRow({
  label, value, sub, valueClass,
}: {
  label: string; value: string; sub?: string; valueClass?: string;
}) {
  return (
    <div className="flex justify-between gap-2 text-xs">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className={`font-medium text-right ${valueClass ?? ""}`}>
        {value}
        {sub && <span className="text-muted-foreground ml-1 font-normal">{sub}</span>}
      </span>
    </div>
  );
}
