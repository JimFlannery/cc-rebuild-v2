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
