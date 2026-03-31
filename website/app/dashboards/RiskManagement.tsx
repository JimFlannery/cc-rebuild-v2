"use client";

import { useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { getUserRiskMetrics, type UserRiskMetrics } from "@/app/_actions/getDashboardMetrics";
import { cn } from "@/lib/utils";

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { notation: "compact", compactDisplay: "short" }).format(n);

const fmtFull = (n: number) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n);

function probRange(min: number, max: number, count: number): string {
  if (count === 0) return "—";
  if (min === max) return `${(max * 100).toFixed(2)}%`;
  return `${(min * 100).toFixed(2)}%–${(max * 100).toFixed(2)}%`;
}

function pct(numerator: number, denominator: number): string {
  if (denominator === 0) return "—";
  return `${Math.round((numerator / denominator) * 100)}%`;
}

function RiskCard({
  title,
  badge,
  amount,
  rows,
  note,
  titleExtra,
}: {
  title: string;
  badge?: string;
  amount: number;
  rows: { label: string; value: string }[];
  note: string;
  titleExtra?: React.ReactNode;
}) {
  return (
    <div className="bg-slate-200 dark:bg-slate-800 rounded-sm px-3 py-2 flex flex-col gap-1 min-w-0">
      <div className="flex items-center gap-1 text-xs font-medium opacity-80">
        <span>{title}</span>
        {titleExtra}
        {badge !== undefined && (
          <span className="ml-auto border border-muted-foreground rounded-sm px-1 tabular-nums">
            {badge}
          </span>
        )}
      </div>
      <div className="flex items-start gap-2">
        <div className="flex-1 space-y-0.5 opacity-50 text-xs">
          {rows.map((r) => (
            <div key={r.label} className="flex gap-1">
              <span>{r.label}:</span>
              <span className="ml-auto tabular-nums">{r.value}</span>
            </div>
          ))}
        </div>
        <div className="text-2xl font-semibold opacity-70 dark:opacity-80 tabular-nums shrink-0">
          ${fmt(amount)}
        </div>
      </div>
      <div className="text-xs opacity-60">{note}</div>
    </div>
  );
}

export function RiskManagement() {
  const { connected, publicKey } = useWallet();
  const [metrics, setMetrics] = useState<UserRiskMetrics | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!connected || !publicKey) {
      setMetrics(null);
      return;
    }
    setLoading(true);
    getUserRiskMetrics(publicKey.toBase58())
      .then(setMetrics)
      .finally(() => setLoading(false));
  }, [connected, publicKey]);

  if (!connected) {
    return (
      <p className="text-sm text-muted-foreground">
        Connect your wallet to view your risk management metrics.
      </p>
    );
  }

  if (loading || !metrics) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
      <RiskCard
        title="My Total Cover Supplied"
        amount={metrics.covSup}
        rows={[
          { label: "Cover", value: `$${fmtFull(metrics.covSup)}` },
          { label: "Cover Contracts", value: String(metrics.covSupCount) },
          { label: "Payout Risk", value: probRange(metrics.covSupMinProb, metrics.covSupMaxProb, metrics.covSupCount) },
        ]}
        note="Cover supplied as cover party in active contracts"
      />
      <RiskCard
        title="My Offsetting Contracts"
        titleExtra={<span className="text-sky-700 dark:text-blue-300">(Delta Neutral)</span>}
        badge={pct(metrics.hedSec, metrics.covSup)}
        amount={metrics.hedSec}
        rows={[
          { label: "Hedge", value: `$${fmtFull(metrics.hedSec)}` },
          { label: "Hedge Contracts", value: String(metrics.hedSecCount) },
          { label: "Payout Risk", value: probRange(metrics.hedSecMinProb, metrics.hedSecMaxProb, metrics.hedSecCount) },
        ]}
        note="Cover secured as hedge party in active contracts"
      />
      <RiskCard
        title="My Offsetting Orders"
        titleExtra={<span className="opacity-60">(not yet matched)</span>}
        badge={pct(metrics.hedPen, metrics.covSup)}
        amount={metrics.hedPen}
        rows={[
          { label: "Hedge", value: `$${fmtFull(metrics.hedPen)}` },
          { label: "Hedge Orders", value: String(metrics.hedPenCount) },
          { label: "Payout Risk", value: probRange(metrics.hedPenMinProb, metrics.hedPenMaxProb, metrics.hedPenCount) },
        ]}
        note="Offsetting cover sought as hedge party in open orders"
      />
      <RiskCard
        title="My Unmitigated Cover at Risk"
        badge={pct(metrics.covRisk, metrics.covSup)}
        amount={metrics.covRisk}
        rows={[
          { label: "Cover", value: `$${fmtFull(metrics.covRisk)}` },
          { label: "Cover Contracts", value: String(metrics.covRiskCount) },
          { label: "Payout Risk", value: probRange(metrics.covRiskMinProb, metrics.covRiskMaxProb, metrics.covRiskCount) },
        ]}
        note="Cover at risk without offsetting contracts or orders"
      />
    </div>
  );
}
