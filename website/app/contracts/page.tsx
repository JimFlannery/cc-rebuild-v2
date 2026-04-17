"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import { cn } from "@/lib/utils";
import { getUserContracts, type UserContract } from "@/app/_actions/getUserContracts";

type StatusFilter = "all" | "Active" | "Settled";

function shortIndex(name: string): string {
  if (!name) return "—";
  if (name.includes("Disturbance")) return "Dst";
  if (name.includes("Planetary")) return "Kp";
  if (name.includes("X-Ray")) return "X-Ray";
  if (name.includes("Proton")) return "Proton";
  return "Radio";
}

function formatCondition(c: UserContract): string {
  const idx = shortIndex(c.indexName);
  const level = c.indexLevel < 0 ? `< ${c.indexLevel}` : `≥ ${c.indexLevel / 100}`;
  return `${idx} ${level} ${c.indexUnit}`;
}

function formatCoverage(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function shortWallet(address: string | null): string {
  if (!address) return "—";
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

function outcomeLabel(outcome: number | null, role: string): { text: string; class: string } {
  if (outcome === null) return { text: "Active", class: "text-blue-500" };
  if (outcome === 1) {
    return role === "Hedge"
      ? { text: "Won", class: "text-green-600 dark:text-green-400" }
      : { text: "Lost", class: "text-red-500" };
  }
  return role === "Cover"
    ? { text: "Won", class: "text-green-600 dark:text-green-400" }
    : { text: "Lost", class: "text-red-500" };
}

function timeRemaining(expiration: string | null): string {
  if (!expiration) return "—";
  const diff = new Date(expiration).getTime() - Date.now();
  if (diff <= 0) return "Expired";
  const days = Math.floor(diff / 86_400_000);
  if (days > 0) return `${days}d`;
  const hours = Math.floor(diff / 3_600_000);
  return `${hours}h`;
}

function shortId(id: string): string {
  return id.slice(0, 8);
}

function formatCreated(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const date = d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const time = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
  return `${date} ${time}`;
}

export default function ContractsPage() {
  const { connected, publicKey } = useWallet();
  const router = useRouter();
  const [contracts, setContracts] = useState<UserContract[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  useEffect(() => {
    if (!connected || !publicKey) return;
    setLoading(true);
    getUserContracts(publicKey.toBase58())
      .then(setContracts)
      .finally(() => setLoading(false));
  }, [connected, publicKey]);

  const filtered = useMemo(() => {
    return contracts.filter((c) => {
      if (statusFilter === "Active") return c.contractOutcome === null;
      if (statusFilter === "Settled") return c.contractOutcome !== null;
      return true;
    });
  }, [contracts, statusFilter]);

  const activeCount = contracts.filter((c) => c.contractOutcome === null).length;
  const settledCount = contracts.filter((c) => c.contractOutcome !== null).length;

  return (
    <main className="mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-semibold mb-2">My Contracts</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Matched contracts where you are a hedge or cover party.
      </p>

      {!connected ? (
        <div className="rounded-lg border border-border px-6 py-16 text-center">
          <p className="text-sm text-muted-foreground">Connect your wallet to view your contracts.</p>
        </div>
      ) : loading ? (
        <div className="rounded-lg border border-border px-6 py-16 text-center">
          <p className="text-sm text-muted-foreground">Loading contracts...</p>
        </div>
      ) : (
        <>
          {/* Summary */}
          {contracts.length > 0 && (
            <div className="flex gap-6 mb-4 text-sm">
              <span><span className="font-medium">{activeCount}</span> <span className="text-muted-foreground">active</span></span>
              <span><span className="font-medium">{settledCount}</span> <span className="text-muted-foreground">settled</span></span>
            </div>
          )}

          {/* Filters */}
          <div className="flex gap-1 mb-4">
            {(["all", "Active", "Settled"] as StatusFilter[]).map((f) => (
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
                {f === "all" ? "All" : f}
              </button>
            ))}
          </div>

          {filtered.length === 0 ? (
            <div className="rounded-lg border border-border px-6 py-10 text-center">
              <p className="text-sm text-muted-foreground">No contracts found.</p>
            </div>
          ) : (
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-200 dark:bg-gray-800 text-left">
                    <th className="px-3 py-2 font-medium">Contract ID</th>
                    <th className="px-3 py-2 font-medium">Role</th>
                    <th className="px-3 py-2 font-medium">Outcome</th>
                    <th className="px-3 py-2 font-medium">Payout Condition</th>
                    <th className="px-3 py-2 font-medium">Coverage</th>
                    <th className="px-3 py-2 font-medium">Premium</th>
                    <th className="px-3 py-2 font-medium">Duration</th>
                    <th className="px-3 py-2 font-medium">Time Left</th>
                    <th className="px-3 py-2 font-medium">Counterparty</th>
                    <th className="px-3 py-2 font-medium">Oracle Checks</th>
                    <th className="px-3 py-2 font-medium">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map((c) => {
                    const outcome = outcomeLabel(c.contractOutcome, c.role);
                    return (
                      <tr
                        key={c.id}
                        className="hover:bg-accent/30 transition-colors cursor-pointer"
                        onClick={() => router.push(`/contracts/${c.id}`)}
                      >
                        <td className="px-3 py-2.5 text-xs font-mono text-muted-foreground">
                          {shortId(c.id)}
                        </td>
                        <td className="px-3 py-2.5 text-xs">
                          <span className={cn(
                            "px-2 py-0.5 rounded text-xs font-medium",
                            c.role === "Hedge"
                              ? "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"
                              : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                          )}>
                            {c.role}
                          </span>
                        </td>
                        <td className={cn("px-3 py-2.5 text-xs font-medium", outcome.class)}>
                          {outcome.text}
                        </td>
                        <td className="px-3 py-2.5 text-xs">{formatCondition(c)}</td>
                        <td className="px-3 py-2.5 text-xs">{formatCoverage(c.coverage)}</td>
                        <td className="px-3 py-2.5 text-xs">${c.hedgePremium.toFixed(2)}</td>
                        <td className="px-3 py-2.5 text-xs">{c.contractDuration}d</td>
                        <td className="px-3 py-2.5 text-xs text-muted-foreground">
                          {c.contractOutcome !== null ? "—" : timeRemaining(c.expiration)}
                        </td>
                        <td className="px-3 py-2.5 text-xs font-mono text-muted-foreground">
                          {shortWallet(c.counterparty)}
                        </td>
                        <td className="px-3 py-2.5 text-xs text-muted-foreground">{c.oracleChecks}</td>
                        <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                          {formatCreated(c.created)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </main>
  );
}
