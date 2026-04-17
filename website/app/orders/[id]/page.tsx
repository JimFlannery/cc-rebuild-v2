"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import { cn } from "@/lib/utils";
import {
  formatCondition, longIndex, shortId, shortWallet,
  formatCreated, timeRemaining,
} from "@/lib/orderFormat";
import { getMyOrderById, type MyOrder } from "@/app/_actions/getMyOrderById";
import { getOrderFills, type OrderFill } from "@/app/_actions/getOrderFills";
import { getTiers, type Tier } from "@/app/_actions/getTiers";
import { matchTier } from "@/lib/orderConstants";
import { cancelOrder } from "@/app/_actions/cancelOrder";
import { OrderDetailsGrid } from "@/components/order/OrderDetailsGrid";
import { SettlementExplainer } from "@/components/order/SettlementExplainer";
import { OnChainRefs } from "@/components/order/OnChainRefs";

interface Props {
  params: Promise<{ id: string }>;
}

function statusClass(status: string): string {
  switch (status) {
    case "Open": return "text-blue-500 border-blue-500/40 bg-blue-500/10";
    case "Matched": return "text-yellow-500 border-yellow-500/40 bg-yellow-500/10";
    case "Settled": return "text-green-600 dark:text-green-400 border-green-500/40 bg-green-500/10";
    case "Cancelled": return "text-muted-foreground border-border bg-muted";
    default: return "text-muted-foreground border-border";
  }
}

export default function MyOrderDetailPage({ params }: Props) {
  const { id } = use(params);
  const router = useRouter();
  const { connected, publicKey } = useWallet();

  const [order, setOrder] = useState<MyOrder | null>(null);
  const [fills, setFills] = useState<OrderFill[]>([]);
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [loading, setLoading] = useState(false);
  const [notFoundState, setNotFoundState] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  useEffect(() => {
    if (!connected || !publicKey) return;
    let alive = true;
    const wallet = publicKey.toBase58();

    setLoading(true);
    setNotFoundState(false);

    (async () => {
      const [o, ts] = await Promise.all([
        getMyOrderById(id, wallet),
        getTiers(),
      ]);

      if (!alive) return;

      if (!o) {
        setNotFoundState(true);
        setLoading(false);
        return;
      }

      setOrder(o);
      setTiers(ts);

      if (o.orderType === "Hedge") {
        const f = await getOrderFills(o.id);
        if (alive) setFills(f);
      }

      if (alive) setLoading(false);
    })();

    return () => { alive = false; };
  }, [id, connected, publicKey]);

  async function handleCancel() {
    if (!order || !publicKey) return;
    if (!confirm("Cancel this order? This cannot be undone.")) return;
    setCancelling(true);
    setCancelError(null);
    const res = await cancelOrder(order.id, publicKey.toBase58());
    setCancelling(false);
    if (!res.ok) {
      setCancelError(res.error ?? "Failed to cancel order.");
      return;
    }
    router.push("/orders");
  }

  if (!connected) {
    return (
      <main className="mx-auto max-w-5xl w-full px-4 sm:px-6 lg:px-8 py-8">
        <div className="rounded-lg border border-border px-6 py-16 text-center">
          <p className="text-sm text-muted-foreground">Connect your wallet to view this order.</p>
        </div>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="mx-auto max-w-5xl w-full px-4 sm:px-6 lg:px-8 py-8">
        <div className="rounded-lg border border-border px-6 py-16 text-center">
          <p className="text-sm text-muted-foreground">Loading order...</p>
        </div>
      </main>
    );
  }

  if (notFoundState || !order) {
    return (
      <main className="mx-auto max-w-5xl w-full px-4 sm:px-6 lg:px-8 py-8">
        <Link href="/orders" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6">
          ← Back to My Orders
        </Link>
        <div className="rounded-lg border border-border px-6 py-16 text-center">
          <p className="text-sm text-muted-foreground">
            Order not found, or not owned by the connected wallet.
          </p>
        </div>
      </main>
    );
  }

  const indexShort = longIndex(order.indexName);
  const conditionDisplay = formatCondition(order.indexName, order.indexLevel, order.indexUnit);

  const filled = order.coverageFilled;
  const currentTier = filled > 0 ? matchTier(tiers, filled) : null;
  const currentAPY = currentTier?.APY ?? 0;
  const maxTier = matchTier(tiers, order.coverage);
  const maxAPY = maxTier?.APY ?? 0;
  const fillPct = order.coverage > 0 ? Math.min(100, (filled / order.coverage) * 100) : 0;

  const canCancel =
    order.status === "Open" &&
    !order.orderTaken &&
    order.coverageFilled === 0;

  return (
    <main className="mx-auto max-w-5xl w-full px-4 sm:px-6 lg:px-8 py-8">

      <Link
        href="/orders"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
      >
        ← Back to My Orders
      </Link>

      {/* Header */}
      <div className="space-y-1 mb-6">
        <div className="flex items-center gap-3 flex-wrap">
          <span className={cn(
            "px-2 py-0.5 rounded text-xs font-medium",
            order.orderType === "Hedge"
              ? "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"
              : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
          )}>
            {order.orderType}
          </span>
          <span className={cn(
            "px-2 py-0.5 rounded text-xs font-medium border",
            statusClass(order.status)
          )}>
            {order.status}
          </span>
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            {order.denomination} · {indexShort}
          </span>
        </div>
        <h1 className="text-xl font-semibold">{conditionDisplay}</h1>
        <p className="text-xs text-muted-foreground">
          Order <span className="font-mono">#{shortId(order.id)}</span> · Created {formatCreated(order.createdAt)}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-6">

        {/* ── Left column ───────────────────────────────────────────────── */}
        <div className="space-y-5">

          <OrderDetailsGrid
            coverage={order.coverage}
            coverageFilled={order.coverageFilled}
            payoutProbability={order.payoutProbability}
            contractDuration={order.contractDuration}
            hedgePremium={order.adjustedHedgePremium || order.hedgePremium}
            denomination={order.denomination}
            currentAPY={order.orderType === "Cover" ? (order.coverRewardAPY ?? currentAPY) : currentAPY}
            maxAPY={maxAPY}
            formattedExpiration={order.formattedExpiration}
          />

          {/* Fill Progress (Hedge orders only) */}
          {order.orderType === "Hedge" && order.coverage > 0 && (
            <section className="rounded-lg border border-border">
              <h2 className="bg-gray-200 dark:bg-gray-800 px-4 py-2 text-sm font-medium rounded-t-lg">
                Fill Progress
              </h2>
              <div className="px-4 py-4 space-y-3">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Coverage filled</span>
                  <span className="font-medium">
                    ${filled.toLocaleString()} / ${order.coverage.toLocaleString()} ({fillPct.toFixed(0)}%)
                  </span>
                </div>
                <div className="h-2 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-green-500 transition-all duration-300"
                    style={{ width: `${fillPct}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {fills.length} cover {fills.length === 1 ? "party" : "parties"}
                  {fills.length > 0 && ` · last fill ${formatCreated(fills[fills.length - 1].createdAt)}`}
                </p>
              </div>
            </section>
          )}

          {/* Matched Contracts (Hedge orders) or Linked Hedge (Cover orders) */}
          {order.orderType === "Hedge" && fills.length > 0 && (
            <section className="rounded-lg border border-border">
              <h2 className="bg-gray-200 dark:bg-gray-800 px-4 py-2 text-sm font-medium rounded-t-lg">
                Matched Contracts
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-muted-foreground">
                      <th className="px-3 py-2 font-medium">Contract</th>
                      <th className="px-3 py-2 font-medium">Counterparty</th>
                      <th className="px-3 py-2 font-medium">Coverage</th>
                      <th className="px-3 py-2 font-medium">Matched</th>
                      <th className="px-3 py-2 font-medium">Time Left</th>
                      <th className="px-3 py-2 font-medium">Oracle Checks</th>
                      <th className="px-3 py-2 font-medium">Outcome</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {fills.map((f) => (
                      <tr
                        key={f.id}
                        className={cn(
                          "transition-colors",
                          f.contractId && "hover:bg-accent/30 cursor-pointer"
                        )}
                        onClick={() => {
                          if (f.contractId) router.push(`/contracts/${f.contractId}`);
                        }}
                      >
                        <td className="px-3 py-2 font-mono text-muted-foreground">
                          {f.contractId ? shortId(f.contractId) : "—"}
                        </td>
                        <td className="px-3 py-2 font-mono text-muted-foreground">
                          {shortWallet(f.walletAddress)}
                        </td>
                        <td className="px-3 py-2">${f.coverage.toLocaleString()}</td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {formatCreated(f.createdAt)}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {f.contractOutcome !== null ? "—" : timeRemaining(f.expiration)}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">{f.oracleChecks}</td>
                        <td className="px-3 py-2">
                          {f.contractOutcome === null ? (
                            <span className="text-blue-500">Active</span>
                          ) : f.contractOutcome === 1 ? (
                            <span className="text-green-600 dark:text-green-400">Payout</span>
                          ) : (
                            <span className="text-muted-foreground">Expired</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {order.orderType === "Cover" && order.matchingOrderID && (
            <section className="rounded-lg border border-border">
              <h2 className="bg-gray-200 dark:bg-gray-800 px-4 py-2 text-sm font-medium rounded-t-lg">
                Linked Hedge Order
              </h2>
              <div className="px-4 py-3 text-sm space-y-1">
                <p className="text-xs text-muted-foreground">
                  This Cover order was placed against Hedge order{" "}
                  <span className="font-mono text-foreground">#{shortId(order.matchingOrderID)}</span>.
                </p>
                <Link
                  href={`/markets/${order.matchingOrderID}`}
                  className="text-sm text-primary hover:underline inline-block mt-1"
                >
                  View market order →
                </Link>
              </div>
            </section>
          )}

          <SettlementExplainer
            denomination={order.denomination}
            mode={order.orderType === "Hedge" ? "hedge-perspective" : "cover-perspective"}
          />

          <OnChainRefs
            walletAddress={order.walletAddress}
            orderAddress={order.orderAddress}
            denominationAddress={order.denominationAddress}
          />
        </div>

        {/* ── Right column: actions + metadata ─────────────────────────── */}
        <div className="space-y-4">

          <section className="rounded-lg border border-border">
            <h2 className="bg-gray-200 dark:bg-gray-800 px-4 py-2 text-sm font-medium rounded-t-lg">
              Actions
            </h2>
            <div className="px-4 py-4 space-y-3 text-sm">
              {canCancel ? (
                <>
                  <p className="text-xs text-muted-foreground">
                    No fills yet — you can cancel this order and reclaim your escrow.
                  </p>
                  <button
                    onClick={handleCancel}
                    disabled={cancelling}
                    className="w-full rounded-md border border-red-500 text-red-500 hover:bg-red-500/10 px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
                  >
                    {cancelling ? "Cancelling..." : "Cancel Order"}
                  </button>
                  {cancelError && (
                    <p className="text-xs text-red-500">{cancelError}</p>
                  )}
                </>
              ) : order.status === "Open" && order.coverageFilled > 0 ? (
                <p className="text-xs text-muted-foreground">
                  Cannot cancel — this order has been partially filled. It will remain open for
                  additional cover until the expiration.
                </p>
              ) : order.status === "Matched" ? (
                <p className="text-xs text-muted-foreground">
                  Order is matched. Settlement will occur automatically when the contract expires
                  or the payout condition is triggered.
                </p>
              ) : order.status === "Settled" ? (
                <p className="text-xs text-muted-foreground">
                  Order has settled. See contract details for final outcome.
                </p>
              ) : order.status === "Cancelled" ? (
                <p className="text-xs text-muted-foreground">This order was cancelled.</p>
              ) : (
                <p className="text-xs text-muted-foreground">No actions available.</p>
              )}
            </div>
          </section>

          <section className="rounded-lg border border-border">
            <h2 className="bg-gray-200 dark:bg-gray-800 px-4 py-2 text-sm font-medium rounded-t-lg">
              Summary
            </h2>
            <div className="px-4 py-4 space-y-2 text-xs">
              <Row label="Order Type" value={order.orderType} />
              <Row label="Status" value={order.status} />
              <Row label="Coverage" value={`$${order.coverage.toLocaleString()}`} />
              <Row label="Filled" value={`$${filled.toLocaleString()}`} />
              <Row label="Premium" value={`$${(order.adjustedHedgePremium || order.hedgePremium).toFixed(2)}`} />
              <Row label="Currency" value={order.denomination} />
              <Row label="Duration" value={`${order.contractDuration}d`} />
              <Row label="APY" value={currentAPY > 0 ? `${(currentAPY * 100).toFixed(1)}%` : "—"} />
              <Row label="Created" value={formatCreated(order.createdAt)} />
              {order.formattedExpiration && <Row label="Expires" value={order.formattedExpiration} />}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right">{value}</span>
    </div>
  );
}
