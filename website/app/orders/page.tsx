"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import { cn } from "@/lib/utils";
import { getUserOrders, type UserOrder } from "@/app/_actions/getUserOrders";

type Filter = "all" | "Hedge" | "Cover";
type StatusFilter = "all" | "Open" | "Matched" | "Settled" | "Cancelled";

function shortIndex(name: string): string {
  if (name.includes("Disturbance")) return "Dst";
  if (name.includes("Planetary")) return "Kp";
  if (name.includes("X-Ray")) return "X-Ray";
  if (name.includes("Proton")) return "Proton";
  return "Radio";
}

function formatCondition(order: UserOrder): string {
  const idx = shortIndex(order.indexName);
  const level = order.indexLevel < 0 ? `< ${order.indexLevel}` : `≥ ${order.indexLevel / 100}`;
  return `${idx} ${level} ${order.indexUnit}`;
}

function formatCoverage(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function shortId(id: string): string {
  return id.slice(0, 8);
}

function formatCreated(iso: string | Date): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const time = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
  return `${date} ${time}`;
}

function statusBadge(status: string): string {
  switch (status) {
    case "Open": return "text-blue-500";
    case "Matched": return "text-yellow-500";
    case "Settled": return "text-green-600 dark:text-green-400";
    case "Cancelled": return "text-muted-foreground";
    default: return "";
  }
}

export default function OrdersPage() {
  const { connected, publicKey } = useWallet();
  const router = useRouter();
  const [orders, setOrders] = useState<UserOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [typeFilter, setTypeFilter] = useState<Filter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  useEffect(() => {
    if (!connected || !publicKey) return;
    setLoading(true);
    getUserOrders(publicKey.toBase58())
      .then(setOrders)
      .finally(() => setLoading(false));
  }, [connected, publicKey]);

  const filtered = useMemo(() => {
    return orders.filter((o) => {
      if (typeFilter !== "all" && o.orderType !== typeFilter) return false;
      if (statusFilter !== "all" && o.status !== statusFilter) return false;
      return true;
    });
  }, [orders, typeFilter, statusFilter]);

  return (
    <main className="mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-semibold mb-2">My Orders</h1>
      <p className="text-sm text-muted-foreground mb-6">
        All orders placed from your connected wallet.
      </p>

      {!connected ? (
        <div className="rounded-lg border border-border px-6 py-16 text-center">
          <p className="text-sm text-muted-foreground">Connect your wallet to view your orders.</p>
        </div>
      ) : loading ? (
        <div className="rounded-lg border border-border px-6 py-16 text-center">
          <p className="text-sm text-muted-foreground">Loading orders...</p>
        </div>
      ) : (
        <>
          {/* Filters */}
          <div className="flex flex-wrap gap-4 mb-4">
            <div className="flex gap-1">
              {(["all", "Hedge", "Cover"] as Filter[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setTypeFilter(f)}
                  className={cn(
                    "px-3 py-1 text-xs font-medium rounded-md border transition-colors",
                    typeFilter === f
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border text-muted-foreground hover:text-foreground"
                  )}
                >
                  {f === "all" ? "All Types" : f}
                </button>
              ))}
            </div>
            <div className="flex gap-1">
              {(["all", "Open", "Matched", "Settled", "Cancelled"] as StatusFilter[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setStatusFilter(f)}
                  className={cn(
                    "px-3 py-1 text-xs font-medium rounded-md border transition-colors",
                    statusFilter === f
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border text-muted-foreground hover:text-foreground"
                  )}
                >
                  {f === "all" ? "All Status" : f}
                </button>
              ))}
            </div>
          </div>

          <p className="text-xs text-muted-foreground mb-3">{filtered.length} order{filtered.length !== 1 ? "s" : ""}</p>

          {filtered.length === 0 ? (
            <div className="rounded-lg border border-border px-6 py-10 text-center">
              <p className="text-sm text-muted-foreground">No orders found.</p>
            </div>
          ) : (
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-200 dark:bg-gray-800 text-left">
                    <th className="px-3 py-2 font-medium">Order ID</th>
                    <th className="px-3 py-2 font-medium">Type</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">Payout Condition</th>
                    <th className="px-3 py-2 font-medium">Coverage</th>
                    <th className="px-3 py-2 font-medium">Filled</th>
                    <th className="px-3 py-2 font-medium">Premium</th>
                    <th className="px-3 py-2 font-medium">Currency</th>
                    <th className="px-3 py-2 font-medium">Duration</th>
                    <th className="px-3 py-2 font-medium">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map((order) => (
                    <tr
                      key={order.id}
                      className="hover:bg-accent/30 transition-colors cursor-pointer"
                      onClick={() => router.push(`/orders/${order.id}`)}
                    >
                      <td className="px-3 py-2.5 text-xs font-mono text-muted-foreground">
                        {shortId(order.id)}
                      </td>
                      <td className="px-3 py-2.5 text-xs">
                        <span className={cn(
                          "px-2 py-0.5 rounded text-xs font-medium",
                          order.orderType === "Hedge"
                            ? "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"
                            : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                        )}>
                          {order.orderType}
                        </span>
                      </td>
                      <td className={cn("px-3 py-2.5 text-xs font-medium", statusBadge(order.status ?? ""))}>
                        {order.status}
                      </td>
                      <td className="px-3 py-2.5 text-xs">{formatCondition(order)}</td>
                      <td className="px-3 py-2.5 text-xs">{formatCoverage(order.coverage)}</td>
                      <td className="px-3 py-2.5 text-xs">{formatCoverage(order.coverageFilled)}</td>
                      <td className="px-3 py-2.5 text-xs">${order.adjustedHedgePremium.toFixed(2)}</td>
                      <td className="px-3 py-2.5 text-xs">{order.denomination}</td>
                      <td className="px-3 py-2.5 text-xs">{order.contractDuration}d</td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                        {formatCreated(order.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </main>
  );
}
