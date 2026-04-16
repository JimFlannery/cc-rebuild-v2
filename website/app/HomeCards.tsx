"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { matchTier } from "@/lib/orderConstants";
import type { Tier } from "@/app/_actions/getTiers";

// ── Free Form Cover Card (Card 3) ─────────────────────────────────────────────

export function FreeFormCoverCard({ tiers }: { tiers: Tier[] }) {
  const router = useRouter();
  const [amount, setAmount] = useState("");

  const coverage = parseFloat(amount.replace(/,/g, "")) || 0;
  const matched  = matchTier(tiers, coverage);
  const apy      = matched?.APY ?? 0;

  return (
    <div className="rounded-xl border border-border bg-card flex flex-col h-full">
      <CardHeader
        type="Supply Cover"
        badge={<span className="text-xs text-blue-500 font-medium">Free Form</span>}
      />
      <div className="flex flex-col gap-3 px-4 py-3 flex-1">
        <StatRow label="SSTM Reward APY" valueClass="text-green-600 dark:text-green-400"
          value={apy > 0 ? `${(apy * 100).toFixed(1)}%` : "---%"} />
        <StatRow label="Risk of Cover Payout"
          value="See order details" valueClass="text-red-500" />
        <StatRow label="Contract Length" value="You choose" />

        <div>
          <label className="text-xs text-muted-foreground block mb-1">Coverage Amount ($)</label>
          <input
            type="number"
            placeholder="Enter amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          />
          {matched && (
            <p className="text-xs text-muted-foreground mt-1">Tier: {matched.Name}</p>
          )}
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" id="rc-reduce" className="accent-primary" />
          <label htmlFor="rc-reduce">Reduce Risk Option</label>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" id="rc-amplify" className="accent-primary" />
          <label htmlFor="rc-amplify">Yield Amplifier Option</label>
        </div>
      </div>

      <div className="px-4 pb-4">
        <button
          onClick={() => router.push(coverage > 0
            ? `/markets?denom=SSTM&minCov=${Math.floor(coverage * 0.9)}&maxCov=${Math.ceil(coverage * 1.1)}`
            : "/markets?denom=SSTM"
          )}
          className="w-full rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
        >
          Review / Customize Order
        </button>
      </div>
    </div>
  );
}

// ── Free Form Hedge Card (Card 5) ─────────────────────────────────────────────

export function FreeFormHedgeCard() {
  const router = useRouter();
  const [amount, setAmount] = useState("");

  const coverage = parseFloat(amount.replace(/,/g, "")) || 0;
  // Estimated premium at ~1.2% (Dst -850 nT probability as default display)
  const premiumPct = 1.2;
  const premium = coverage * premiumPct / 100;

  return (
    <div className="rounded-xl border border-amber-400/60 bg-amber-50/20 dark:bg-amber-950/10 flex flex-col h-full">
      <CardHeader
        type="Seeking Cover"
        badge={<span className="text-xs text-amber-600 dark:text-amber-400 font-medium">Free Form Hedge</span>}
        bgClass="bg-amber-100/60 dark:bg-amber-900/30"
      />
      <div className="flex flex-col gap-3 px-4 py-3 flex-1">
        <StatRow label="Premium %" value={`${premiumPct}%`} valueClass="text-green-600 dark:text-green-400" />
        <StatRow label="Payout Trigger" value="Dst < -850 nT" />
        <StatRow label="Probability of Cover Payout"
          value="1.2% / yr" valueClass="text-red-500" />
        <StatRow label="Cost to Enter"
          value={coverage > 0 ? `$${(premium).toFixed(2)}` : "Calculated"} />

        <div>
          <label className="text-xs text-muted-foreground block mb-1">Coverage Amount ($)</label>
          <input
            type="number"
            placeholder="Enter amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <StatRow label="Contract Length" value="You choose" />
      </div>

      <div className="px-4 pb-4">
        <button
          onClick={() => router.push("/hedge")}
          className="w-full rounded-md bg-amber-500 hover:bg-amber-600 px-4 py-2 text-sm font-semibold text-white transition-colors"
        >
          Review / Customize Order
        </button>
      </div>
    </div>
  );
}

// ── Feature Cards Row ─────────────────────────────────────────────────────────

const FEATURE_TABS = [
  {
    key: "markets",
    borderClass: "border-green-500",
    activeBg: "bg-green-500/10",
    badgeClass: "text-green-600 dark:text-green-400",
    dotClass: "bg-green-500",
    title: "Opportunity Sharing",
    headline: "Earn up to 25%",
    sub: "As little as $10 for up to 17%",
    href: "/markets",
    btnLabel: "Markets",
    btnClass: "bg-green-600 hover:bg-green-700",
    explainTitle: "Markets — Opportunity Sharing",
    explainBody: [
      "Browse open cover orders and earn yield by supplying SSTM tokens as collateral.",
      "Premiums are paid upfront. Your tokens earn SSTM rewards on top of the premium income.",
      "Start with as little as $10 and scale up through five reward tiers reaching up to 25% APY.",
      "All positions are settled automatically by a Chainlink oracle reading live NOAA space weather data — no manual claims required.",
    ],
  },
  {
    key: "yieldboost",
    borderClass: "border-blue-500",
    activeBg: "bg-blue-500/10",
    badgeClass: "text-blue-500",
    dotClass: "bg-blue-500",
    title: "Opportunities for Heavy Hitters",
    headline: "Peer-to-Peer Delta Neutral Income",
    sub: "",
    href: "/yieldboost",
    btnLabel: "Yield Boost",
    btnClass: "bg-blue-600 hover:bg-blue-700",
    explainTitle: "Yield Boost — P2P Delta Neutral Looping",
    explainBody: [
      "Match a Cover order with an identical Hedge order in a single click — creating a delta-neutral position with zero net directional risk.",
      "An SSTM loan amplifies your effective coverage amount, pushing you into a higher reward tier without additional capital.",
      "Both legs earn simultaneously: SSTM rewards on the Cover side offset the Hedge premium cost, leaving pure yield.",
      "Positions are managed inside Yield Boost. No manual rebalancing — the looping engine handles rollovers at each MicroMOS interval.",
    ],
  },
  {
    key: "hedge",
    borderClass: "border-yellow-500",
    activeBg: "bg-yellow-500/10",
    badgeClass: "text-yellow-600 dark:text-yellow-400",
    dotClass: "bg-yellow-500",
    title: "Protection",
    headline: "Hedge Against Environmental Events",
    sub: "",
    href: "/hedge",
    btnLabel: "Hedge",
    btnClass: "bg-yellow-500 hover:bg-yellow-600",
    explainTitle: "Hedge — Environmental Risk Protection",
    explainBody: [
      "Pay a small premium (≈ 1–5% of coverage) to receive a large payout if a geomagnetic or solar event crosses your chosen threshold.",
      "Ideal for satellite operators, power utilities, or any business with infrastructure exposure to space weather.",
      "Choose your index (Kp, Dst, Solar X-Ray Flux, etc.) and threshold. Settlement is automatic — no claim forms.",
      "Hedge contracts are matched peer-to-peer against Cover suppliers, keeping premiums market-driven and transparent.",
    ],
  },
] as const;

export function FeatureSection() {
  return (
    <section className="space-y-6">
      {/* Row 1 — 3 feature cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {FEATURE_TABS.map((tab) => (
          <FeatureCard key={tab.key} tab={tab} />
        ))}
      </div>

      {/* Row 2 — large explainer card */}
      <FeatureExplainerCard />
    </section>
  );
}

function FeatureCard({ tab }: { tab: typeof FEATURE_TABS[number] }) {
  return (
    <div className={cn(
      "rounded-xl border-2 bg-card flex flex-col gap-3 px-5 py-5",
      tab.borderClass,
    )}>
      <div>
        <p className={cn("text-xs font-semibold uppercase tracking-wide", tab.badgeClass)}>
          {tab.title}
        </p>
        <p className="text-lg font-bold mt-1">{tab.headline}</p>
        {tab.sub && <p className="text-sm text-muted-foreground mt-0.5">{tab.sub}</p>}
      </div>
      <div className="mt-auto pt-2">
        <a
          href={tab.href}
          className={cn(
            "inline-block rounded-md px-4 py-2 text-sm font-semibold text-white transition-colors",
            tab.btnClass,
          )}
        >
          {tab.btnLabel}
        </a>
      </div>
    </div>
  );
}

export function FeatureExplainerCard() {
  const [active, setActive] = useState(0);
  const tab = FEATURE_TABS[active];

  return (
    <div className={cn(
      "rounded-xl border-2 bg-card transition-colors duration-300",
      tab.borderClass,
    )}>
      {/* Tab selectors */}
      <div className="flex items-center gap-3 px-6 pt-5 pb-3">
        {FEATURE_TABS.map((t, i) => (
          <button
            key={t.key}
            onClick={() => setActive(i)}
            className={cn(
              "flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
              active === i ? cn(t.activeBg, t.badgeClass) : "text-muted-foreground hover:text-foreground",
            )}
          >
            <span className={cn("h-2 w-2 rounded-full shrink-0", t.dotClass)} />
            {t.btnLabel}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="px-6 pb-6 space-y-4">
        <h3 className={cn("text-base font-bold", tab.badgeClass)}>{tab.explainTitle}</h3>
        <ul className="space-y-2">
          {tab.explainBody.map((line, i) => (
            <li key={i} className="flex gap-2 text-sm text-muted-foreground">
              <span className={cn("mt-1.5 h-1.5 w-1.5 rounded-full shrink-0", tab.dotClass)} />
              {line}
            </li>
          ))}
        </ul>
        <div className="pt-2">
          <a
            href={tab.href}
            className={cn(
              "inline-block rounded-md px-5 py-2 text-sm font-semibold text-white transition-colors",
              tab.btnClass,
            )}
          >
            {tab.btnLabel} →
          </a>
        </div>
      </div>
    </div>
  );
}

// ── Shared helpers ─────────────────────────────────────────────────────────────

function CardHeader({
  type, badge, bgClass,
}: {
  type: string;
  badge?: React.ReactNode;
  bgClass?: string;
}) {
  return (
    <div className={cn(
      "rounded-t-xl px-4 py-2.5 flex items-center justify-between gap-2",
      bgClass ?? "bg-gray-100 dark:bg-gray-800"
    )}>
      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        {type}
      </span>
      {badge}
    </div>
  );
}

function StatRow({
  label, value, valueClass,
}: {
  label: string; value: string; valueClass?: string;
}) {
  return (
    <div className="flex justify-between gap-2 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("font-medium text-right", valueClass)}>{value}</span>
    </div>
  );
}
