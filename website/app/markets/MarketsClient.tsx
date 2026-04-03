"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { matchTier } from "@/lib/orderConstants";
import type { OpenHedgeOrder, HedgeOrderFilters } from "@/app/_actions/getOpenHedgeOrders";
import type { Tier } from "@/app/_actions/getTiers";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  orders: OpenHedgeOrder[];
  tiers: Tier[];
  totalCount: number;
  spaceWeatherCount: number;
  initialFilters: HedgeOrderFilters;
}

type Category = "all" | "space-weather" | "hurricanes" | "earthquakes" | "floods";

// ── Helpers ───────────────────────────────────────────────────────────────────

const INDEX_LABELS: Record<string, string> = {
  "Disturbance Storm Time": "Dst",
  "Planetary K-Index": "Kp",
  "Solar X-Ray Flux": "X-Ray",
  "Solar Proton Flux": "Proton",
  "Solar Radio Flux": "Radio",
};

function shortIndex(name: string): string {
  for (const [k, v] of Object.entries(INDEX_LABELS)) {
    if (name.includes(k.split(" ")[0])) return v;
  }
  return name;
}

function formatCoverage(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function formatProb(p: number): string {
  if (p < 0.0001) return "<0.01%";
  return `${(p * 100).toFixed(2)}%`;
}

const SPACE_WEATHER_INDICES = [
  "Disturbance Storm Time",
  "Planetary K-Index",
  "Solar X-Ray Flux",
  "Solar Proton Flux",
  "Solar Radio Flux",
];

function isSpaceWeather(indexName: string): boolean {
  return SPACE_WEATHER_INDICES.some((i) => indexName.includes(i.split(" ")[0]));
}

const INDEX_OPTIONS = [
  { value: "", label: "All indices" },
  { value: "Disturbance Storm Time", label: "Dst — Disturbance Storm Time" },
  { value: "Planetary K-Index", label: "Kp — Planetary K-Index" },
  { value: "Solar X-Ray Flux", label: "Solar X-Ray Flux" },
  { value: "Solar Proton Flux", label: "Solar Proton Flux" },
  { value: "Solar Radio Flux", label: "Solar Radio Flux" },
];

// ── Main component ────────────────────────────────────────────────────────────

export function MarketsClient({
  orders,
  tiers,
  totalCount,
  spaceWeatherCount,
  initialFilters,
}: Props) {
  const router = useRouter();

  const [category, setCategory] = useState<Category>(
    initialFilters.indexName ? "space-weather" : "all"
  );
  const [indexFilter, setIndexFilter]       = useState(initialFilters.indexName ?? "");
  const [denomFilter, setDenomFilter]       = useState(initialFilters.denomination ?? "");
  const [minCov, setMinCov]                 = useState(initialFilters.minCoverage?.toString() ?? "");
  const [maxCov, setMaxCov]                 = useState(initialFilters.maxCoverage?.toString() ?? "");
  const [minProb, setMinProb]               = useState(initialFilters.minProbability?.toString() ?? "");
  const [maxProb, setMaxProb]               = useState(initialFilters.maxProbability?.toString() ?? "");
  const [minDur, setMinDur]                 = useState(initialFilters.minDuration?.toString() ?? "");
  const [maxDur, setMaxDur]                 = useState(initialFilters.maxDuration?.toString() ?? "");

  // Client-side filter of the server-fetched orders
  const filtered = useMemo(() => {
    return orders.filter((o) => {
      if (category === "space-weather" && !isSpaceWeather(o.indexName)) return false;
      if (["hurricanes", "earthquakes", "floods"].includes(category)) return false;
      if (indexFilter && !o.indexName.includes(indexFilter.split(" ")[0])) return false;
      if (denomFilter && o.denomination !== denomFilter) return false;
      if (minCov && o.coverage < Number(minCov)) return false;
      if (maxCov && o.coverage > Number(maxCov)) return false;
      if (minProb && o.payoutProbability < Number(minProb) / 100) return false;
      if (maxProb && o.payoutProbability > Number(maxProb) / 100) return false;
      if (minDur && o.contractDuration < Number(minDur)) return false;
      if (maxDur && o.contractDuration > Number(maxDur)) return false;
      return true;
    });
  }, [orders, category, indexFilter, denomFilter, minCov, maxCov, minProb, maxProb, minDur, maxDur]);

  function handleCardClick(order: OpenHedgeOrder) {
    router.push(`/orders/${order.id}`);
  }

  function resetFilters() {
    setIndexFilter(""); setDenomFilter("");
    setMinCov(""); setMaxCov("");
    setMinProb(""); setMaxProb("");
    setMinDur(""); setMaxDur("");
  }

  const activeFilterCount = [indexFilter, denomFilter, minCov, maxCov, minProb, maxProb, minDur, maxDur]
    .filter(Boolean).length;

  return (
    <div className="flex gap-6">

      {/* ── Left sidebar ─────────────────────────────────────────────────────── */}
      <aside className="hidden lg:flex flex-col gap-1 w-52 shrink-0">

        {/* Category list */}
        <CategoryItem
          label="All Markets"
          count={totalCount}
          active={category === "all"}
          onClick={() => { setCategory("all"); resetFilters(); }}
        />
        <CategoryItem
          label="Space Weather"
          count={spaceWeatherCount}
          active={category === "space-weather"}
          onClick={() => setCategory("space-weather")}
        />
        <CategoryItem label="Hurricanes" count={0} active={false} comingSoon onClick={() => {}} />
        <CategoryItem label="Earthquakes" count={0} active={false} comingSoon onClick={() => {}} />
        <CategoryItem label="Floods"      count={0} active={false} comingSoon onClick={() => {}} />

        <div className="my-3 border-t border-border" />

        {/* Filters */}
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1 flex items-center justify-between">
          Filters
          {activeFilterCount > 0 && (
            <button onClick={resetFilters} className="text-xs text-primary hover:underline normal-case tracking-normal">
              Clear all
            </button>
          )}
        </p>

        {/* Min / Max Coverage */}
        <FilterLabel>Coverage ($)</FilterLabel>
        <div className="flex gap-1">
          <input type="number" placeholder="Min" value={minCov}
            onChange={(e) => setMinCov(e.target.value)}
            className="w-full rounded border border-border bg-background px-2 py-1 text-xs" />
          <input type="number" placeholder="Max" value={maxCov}
            onChange={(e) => setMaxCov(e.target.value)}
            className="w-full rounded border border-border bg-background px-2 py-1 text-xs" />
        </div>

        {/* Index */}
        <FilterLabel>Index</FilterLabel>
        <select value={indexFilter} onChange={(e) => setIndexFilter(e.target.value)}
          className="w-full rounded border border-border bg-background px-2 py-1 text-xs">
          {INDEX_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        {/* Denomination */}
        <FilterLabel>Currency</FilterLabel>
        <select value={denomFilter} onChange={(e) => setDenomFilter(e.target.value)}
          className="w-full rounded border border-border bg-background px-2 py-1 text-xs">
          <option value="">All</option>
          <option value="SSTM">SSTM</option>
          <option value="USDC">USDC</option>
        </select>

        {/* Payout Probability */}
        <FilterLabel>Payout Probability (%)</FilterLabel>
        <div className="flex gap-1">
          <input type="number" placeholder="Min" value={minProb}
            onChange={(e) => setMinProb(e.target.value)} min="0" max="100" step="0.01"
            className="w-full rounded border border-border bg-background px-2 py-1 text-xs" />
          <input type="number" placeholder="Max" value={maxProb}
            onChange={(e) => setMaxProb(e.target.value)} min="0" max="100" step="0.01"
            className="w-full rounded border border-border bg-background px-2 py-1 text-xs" />
        </div>

        {/* Contract Duration */}
        <FilterLabel>Duration (days)</FilterLabel>
        <div className="flex gap-1">
          <input type="number" placeholder="Min" value={minDur}
            onChange={(e) => setMinDur(e.target.value)}
            className="w-full rounded border border-border bg-background px-2 py-1 text-xs" />
          <input type="number" placeholder="Max" value={maxDur}
            onChange={(e) => setMaxDur(e.target.value)}
            className="w-full rounded border border-border bg-background px-2 py-1 text-xs" />
        </div>
      </aside>

      {/* ── Main content ─────────────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0">

        {/* Result count + active category */}
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm text-muted-foreground">
            {filtered.length} order{filtered.length !== 1 ? "s" : ""}
            {category !== "all" && (
              <span className="ml-1">in <span className="text-foreground font-medium capitalize">{category.replace("-", " ")}</span></span>
            )}
          </p>
        </div>

        {/* Cards */}
        {filtered.length === 0 ? (
          <div className="rounded-lg border border-border px-8 py-16 text-center">
            {["hurricanes", "earthquakes", "floods"].includes(category) ? (
              <>
                <p className="text-sm font-medium capitalize">{category} — Coming Soon</p>
                <p className="text-xs text-muted-foreground mt-1">
                  This market category is not yet available. Check back later.
                </p>
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">No orders match the current filters.</p>
                {activeFilterCount > 0 && (
                  <button onClick={resetFilters} className="mt-2 text-xs text-primary hover:underline">
                    Clear filters
                  </button>
                )}
              </>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                tiers={tiers}
                onClick={() => handleCardClick(order)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Order Card ────────────────────────────────────────────────────────────────

function OrderCard({
  order,
  tiers,
  onClick,
}: {
  order: OpenHedgeOrder;
  tiers: Tier[];
  onClick: () => void;
}) {
  const matchedTier = matchTier(tiers, order.coverage);
  const apy = matchedTier?.APY ?? order.coverRewardAPY ?? 0;

  return (
    <button
      onClick={onClick}
      className="group text-left rounded-xl border border-border bg-card hover:border-primary/50 hover:shadow-md transition-all flex flex-col"
    >
      {/* Header */}
      <div className="rounded-t-xl bg-gray-200 dark:bg-gray-800 px-4 py-2.5 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          {shortIndex(order.indexName)}
        </span>
        <div className="flex items-center gap-2">
          {order.yieldBoostEligible && (
            <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
              Yield Boost ✦
            </span>
          )}
          <span className="text-xs font-medium text-muted-foreground">
            {order.denomination}
          </span>
        </div>
      </div>

      {/* Body */}
      <div className="px-4 py-3 flex flex-col gap-3 flex-1">

        {/* Payout condition */}
        <div>
          <p className="text-xs text-muted-foreground">Payout Condition</p>
          <p className="text-sm font-semibold leading-snug group-hover:text-primary transition-colors">
            {order.indexName.includes("Disturbance") ? "Dst" :
             order.indexName.includes("Planetary") ? "Kp" :
             order.indexName.includes("X-Ray") ? "Solar X-Ray" :
             order.indexName.includes("Proton") ? "Solar Proton" : "Solar Radio"}{" "}
            {order.indexLevel < 0 ? `< ${order.indexLevel}` : `≥ ${order.indexLevel / 100}`} {order.indexUnit}
          </p>
        </div>

        {/* Key stats row */}
        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
          <StatItem label="Coverage" value={formatCoverage(order.coverage)} />
          <StatItem label="Payout Probability"
            value={formatProb(order.payoutProbability)}
            valueClass="text-red-500 dark:text-red-400" />
          <StatItem label="Premium" value={`$${order.adjustedHedgePremium?.toFixed(2) ?? "—"}`} />
          <StatItem label="Cover APY"
            value={apy > 0 ? `${(apy * 100).toFixed(1)}%` : "—"}
            valueClass="text-green-600 dark:text-green-400" />
          <StatItem label="Duration" value={`${order.contractDuration}d`} />
          <StatItem label="Expires" value={order.formattedExpiration?.split(" ").slice(0, 3).join(" ") ?? "GTC"} />
        </div>
      </div>

      {/* Footer CTA */}
      <div className="px-4 pb-3">
        <div className="w-full rounded-md bg-primary/10 group-hover:bg-primary group-hover:text-primary-foreground text-primary py-1.5 text-xs font-semibold text-center transition-colors">
          Provide Cover →
        </div>
      </div>
    </button>
  );
}

// ── Small helpers ─────────────────────────────────────────────────────────────

function CategoryItem({
  label, count, active, comingSoon, onClick,
}: {
  label: string; count: number; active: boolean; comingSoon?: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={comingSoon}
      className={cn(
        "flex items-center justify-between w-full rounded-md px-3 py-2 text-sm transition-colors text-left",
        active
          ? "bg-primary/10 text-primary font-medium"
          : "text-foreground hover:bg-accent",
        comingSoon && "opacity-40 cursor-default"
      )}
    >
      <span>{label}</span>
      <span className="text-xs text-muted-foreground">
        {comingSoon ? "soon" : count}
      </span>
    </button>
  );
}

function FilterLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-medium text-muted-foreground mt-2 mb-0.5">{children}</p>;
}

function StatItem({
  label, value, valueClass,
}: {
  label: string; value: string; valueClass?: string;
}) {
  return (
    <div>
      <p className="text-muted-foreground">{label}</p>
      <p className={cn("font-medium", valueClass)}>{value}</p>
    </div>
  );
}
