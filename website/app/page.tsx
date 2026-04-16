import Link from "next/link";
import { getTokenPrices } from "./_actions/prices";
import { getMarketMetrics } from "./_actions/getDashboardMetrics";

export const metadata = { title: "ConditionCover — Space Weather Risk Marketplace" };

function usd(n: number, decimals = 0) {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}

export default async function Home() {
  const [prices, metrics] = await Promise.all([
    getTokenPrices(),
    getMarketMetrics(),
  ]);

  return (
    <main className="mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 py-8 space-y-10">

      {/* ── Hero tagline ───────────────────────────────────────────────────── */}
      <div className="text-center space-y-2">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
          Space Weather Risk Marketplace
        </h1>
        <p className="text-sm sm:text-base text-muted-foreground max-w-2xl mx-auto">
          Earn income by supplying coverage against rare geomagnetic events, or
          go delta neutral for risk-free yield. All contracts settle automatically
          via Chainlink oracle and live NOAA data.
        </p>
      </div>

      {/* ── Two options ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* Option 1 — Supply Cover */}
        <Link
          href="/markets"
          className="group rounded-2xl border-2 border-green-500/60 hover:border-green-500 bg-card transition-all duration-200 hover:shadow-lg flex flex-col"
        >
          <div className="rounded-t-2xl bg-green-500/10 px-6 py-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-green-600 dark:text-green-400">
              Risk Sharing
            </p>
          </div>

          <div className="flex flex-col gap-4 px-6 py-6 flex-1">
            <h2 className="text-xl sm:text-2xl font-bold">
              Supply Cover &amp; Earn up to 17%
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Lock SSTM tokens as coverage against rare space weather events.
              Collect premiums upfront and earn SSTM reward APY. Start with as
              little as $10.
            </p>

            <ul className="space-y-2 text-sm text-muted-foreground mt-auto">
              <li className="flex items-start gap-2">
                <span className="mt-1 h-1.5 w-1.5 rounded-full bg-green-500 shrink-0" />
                Five reward tiers — up to 17% APY
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1 h-1.5 w-1.5 rounded-full bg-green-500 shrink-0" />
                All contracts include risk sharing — offset your exposure automatically
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1 h-1.5 w-1.5 rounded-full bg-green-500 shrink-0" />
                Automatic settlement via Chainlink oracle + NOAA data
              </li>
            </ul>
          </div>

          <div className="px-6 pb-6">
            <span className="inline-block rounded-md bg-green-600 group-hover:bg-green-700 px-5 py-2.5 text-sm font-semibold text-white transition-colors">
              Browse Markets →
            </span>
          </div>
        </Link>

        {/* Option 2 — Delta Neutral Income */}
        <Link
          href="/yieldboost"
          className="group rounded-2xl border-2 border-blue-500/60 hover:border-blue-500 bg-card transition-all duration-200 hover:shadow-lg flex flex-col"
        >
          <div className="rounded-t-2xl bg-blue-500/10 px-6 py-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-500">
              Zero Net Risk
            </p>
          </div>

          <div className="flex flex-col gap-4 px-6 py-6 flex-1">
            <h2 className="text-xl sm:text-2xl font-bold">
              Delta Neutral Income
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Match Cover and Hedge positions simultaneously for a risk-free
              yield. An SSTM loan amplifies your coverage tier without additional
              capital.
            </p>

            <ul className="space-y-2 text-sm text-muted-foreground mt-auto">
              <li className="flex items-start gap-2">
                <span className="mt-1 h-1.5 w-1.5 rounded-full bg-blue-500 shrink-0" />
                Community Yield Boost — pool-based, lower minimum
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1 h-1.5 w-1.5 rounded-full bg-blue-500 shrink-0" />
                Peer-to-Peer Yield Boost — direct matching, higher tiers
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1 h-1.5 w-1.5 rounded-full bg-blue-500 shrink-0" />
                Looping engine handles rollovers — no manual rebalancing
              </li>
            </ul>
          </div>

          <div className="px-6 pb-6">
            <span className="inline-block rounded-md bg-blue-600 group-hover:bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white transition-colors">
              Yield Boost →
            </span>
          </div>
        </Link>
      </div>

      {/* ── Platform stats ───────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card px-6 py-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <SummaryMetric label="Premiums Earned" value={usd(Number(metrics.premiumsEarned), 2)} />
        <SummaryMetric label="Cover Secured" value={usd(Number(metrics.coverSecured))} />
        <SummaryMetric label="TVL (SSTM)" value={usd(Number(metrics.tvlSstm))} />
        <SummaryMetric label="TVL (USDC)" value={usd(Number(metrics.tvlUsdc))} />
        <SummaryMetric label="Total Income Earned" value={usd(Number(metrics.totalIncomeEarned), 2)} />
        <SummaryMetric label="SSTM Price" value={`$${prices.SSTM.toFixed(4)}`} />
      </div>

    </main>
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

