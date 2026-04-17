"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { cn } from "@/lib/utils";
import {
  formatCondition, longIndex, shortId, shortWallet,
  formatCreated, timeRemaining,
} from "@/lib/orderFormat";
import { getContractById, type ContractDetail } from "@/app/_actions/getContractById";
import { SettlementExplainer } from "@/components/order/SettlementExplainer";
import { OnChainRefs } from "@/components/order/OnChainRefs";

interface Props {
  params: Promise<{ id: string }>;
}

function outcomeDisplay(outcome: number | null, role: 'Hedge' | 'Cover') {
  if (outcome === null) return { text: "Active", class: "text-blue-500 border-blue-500/40 bg-blue-500/10" };
  if (outcome === 1) {
    return role === "Hedge"
      ? { text: "Won (Payout)", class: "text-green-600 dark:text-green-400 border-green-500/40 bg-green-500/10" }
      : { text: "Lost (Payout)", class: "text-red-500 border-red-500/40 bg-red-500/10" };
  }
  return role === "Cover"
    ? { text: "Won (No Event)", class: "text-green-600 dark:text-green-400 border-green-500/40 bg-green-500/10" }
    : { text: "Lost (No Event)", class: "text-red-500 border-red-500/40 bg-red-500/10" };
}

export default function ContractDetailPage({ params }: Props) {
  const { id } = use(params);
  const { connected, publicKey } = useWallet();

  const [contract, setContract] = useState<ContractDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [notFoundState, setNotFoundState] = useState(false);

  useEffect(() => {
    if (!connected || !publicKey) return;
    let alive = true;
    setLoading(true);
    setNotFoundState(false);
    getContractById(id, publicKey.toBase58())
      .then((c) => {
        if (!alive) return;
        if (!c) setNotFoundState(true);
        else setContract(c);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => { alive = false; };
  }, [id, connected, publicKey]);

  if (!connected) {
    return (
      <main className="mx-auto max-w-5xl w-full px-4 sm:px-6 lg:px-8 py-8">
        <div className="rounded-lg border border-border px-6 py-16 text-center">
          <p className="text-sm text-muted-foreground">Connect your wallet to view this contract.</p>
        </div>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="mx-auto max-w-5xl w-full px-4 sm:px-6 lg:px-8 py-8">
        <div className="rounded-lg border border-border px-6 py-16 text-center">
          <p className="text-sm text-muted-foreground">Loading contract...</p>
        </div>
      </main>
    );
  }

  if (notFoundState || !contract) {
    return (
      <main className="mx-auto max-w-5xl w-full px-4 sm:px-6 lg:px-8 py-8">
        <Link href="/contracts" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6">
          ← Back to My Contracts
        </Link>
        <div className="rounded-lg border border-border px-6 py-16 text-center">
          <p className="text-sm text-muted-foreground">
            Contract not found, or not owned by the connected wallet.
          </p>
        </div>
      </main>
    );
  }

  const indexShort = longIndex(contract.indexName);
  const conditionDisplay = formatCondition(contract.indexName, contract.indexLevel, contract.indexUnit);
  const outcome = outcomeDisplay(contract.contractOutcome, contract.role);
  const isActive = contract.contractOutcome === null;

  const ownOrderId = contract.role === "Hedge" ? contract.hedgeOrderId : contract.coverOrderId;

  return (
    <main className="mx-auto max-w-5xl w-full px-4 sm:px-6 lg:px-8 py-8">

      <Link
        href="/contracts"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
      >
        ← Back to My Contracts
      </Link>

      <div className="space-y-1 mb-6">
        <div className="flex items-center gap-3 flex-wrap">
          <span className={cn(
            "px-2 py-0.5 rounded text-xs font-medium",
            contract.role === "Hedge"
              ? "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"
              : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
          )}>
            {contract.role}
          </span>
          <span className={cn(
            "px-2 py-0.5 rounded text-xs font-medium border",
            outcome.class
          )}>
            {outcome.text}
          </span>
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            {contract.denomination} · {indexShort}
          </span>
        </div>
        <h1 className="text-xl font-semibold">{conditionDisplay}</h1>
        <p className="text-xs text-muted-foreground">
          Contract <span className="font-mono">#{shortId(contract.id)}</span>
          {contract.created && <> · Matched {formatCreated(contract.created)}</>}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-6">

        {/* ── Left column ───────────────────────────────────────────────── */}
        <div className="space-y-5">

          <section className="rounded-lg border border-border">
            <h2 className="bg-gray-200 dark:bg-gray-800 px-4 py-2 text-sm font-medium rounded-t-lg">
              Contract Details
            </h2>
            <div className="px-4 py-4 grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4 text-sm">
              <DetailItem label="Role" value={contract.role} />
              <DetailItem label="Coverage" value={`$${contract.coverage.toLocaleString()}`} />
              <DetailItem label="Premium" value={`$${contract.hedgePremium.toFixed(2)}`} />
              <DetailItem label="Currency" value={contract.denomination} />
              <DetailItem label="Duration" value={`${contract.contractDuration} days`} />
              <DetailItem
                label="Payout Probability"
                value={`${(contract.payoutProbability * 100).toFixed(4)}%`}
                valueClass="text-red-500 dark:text-red-400"
              />
              <DetailItem
                label="Status"
                value={isActive ? "Active" : (contract.contractOutcome === 1 ? "Settled (Payout)" : "Settled (No Event)")}
              />
              <DetailItem
                label="Time Left"
                value={isActive ? timeRemaining(contract.expiration) : "—"}
              />
              <DetailItem label="Oracle Checks" value={String(contract.oracleChecks)} />
            </div>
          </section>

          <section className="rounded-lg border border-border">
            <h2 className="bg-gray-200 dark:bg-gray-800 px-4 py-2 text-sm font-medium rounded-t-lg">
              Parties
            </h2>
            <div className="px-4 py-4 space-y-3 text-sm">
              <Party label="Hedge Party" wallet={contract.hedgeWallet} isYou={contract.role === "Hedge"} />
              <Party label="Cover Party" wallet={contract.coverWallet} isYou={contract.role === "Cover"} />
            </div>
          </section>

          <section className="rounded-lg border border-border">
            <h2 className="bg-gray-200 dark:bg-gray-800 px-4 py-2 text-sm font-medium rounded-t-lg">
              Linked Orders
            </h2>
            <div className="px-4 py-4 space-y-2 text-sm">
              <LinkedOrder
                label="Hedge Order"
                id={contract.hedgeOrderId}
                isYours={contract.role === "Hedge"}
              />
              <LinkedOrder
                label="Cover Order"
                id={contract.coverOrderId}
                isYours={contract.role === "Cover"}
              />
            </div>
          </section>

          <SettlementExplainer
            denomination={contract.denomination}
            mode={contract.role === "Hedge" ? "hedge-perspective" : "cover-perspective"}
          />

          <OnChainRefs
            walletAddress={contract.myWallet}
            orderAddress={contract.role === "Hedge" ? contract.hedgeOrderAddress : contract.coverOrderAddress}
            denominationAddress={contract.denominationAddress}
            contractAddress={contract.contractAddress}
          />
        </div>

        {/* ── Right column: summary ─────────────────────────────────────── */}
        <div className="space-y-4">
          <section className="rounded-lg border border-border">
            <h2 className="bg-gray-200 dark:bg-gray-800 px-4 py-2 text-sm font-medium rounded-t-lg">
              Summary
            </h2>
            <div className="px-4 py-4 space-y-2 text-xs">
              <Row label="Your Role" value={contract.role} />
              <Row label="Outcome" value={outcome.text} />
              <Row label="Coverage" value={`$${contract.coverage.toLocaleString()}`} />
              <Row label="Premium" value={`$${contract.hedgePremium.toFixed(2)}`} />
              <Row label="Duration" value={`${contract.contractDuration}d`} />
              <Row label="Time Left" value={isActive ? timeRemaining(contract.expiration) : "—"} />
              <Row label="Oracle Checks" value={String(contract.oracleChecks)} />
              <Row label="Counterparty" value={shortWallet(contract.counterpartyWallet)} />
              {contract.created && <Row label="Matched" value={formatCreated(contract.created)} />}
            </div>
          </section>

          <section className="rounded-lg border border-border">
            <h2 className="bg-gray-200 dark:bg-gray-800 px-4 py-2 text-sm font-medium rounded-t-lg">
              Your Order
            </h2>
            <div className="px-4 py-4 text-sm space-y-1">
              <p className="text-xs text-muted-foreground">
                This contract was formed from your {contract.role} order{" "}
                <span className="font-mono text-foreground">#{shortId(ownOrderId)}</span>.
              </p>
              <Link
                href={`/orders/${ownOrderId}`}
                className="text-sm text-primary hover:underline inline-block mt-1"
              >
                View your order →
              </Link>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

function DetailItem({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("font-medium", valueClass)}>{value}</p>
    </div>
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

function Party({ label, wallet, isYou }: { label: string; wallet: string | null; isYou: boolean }) {
  return (
    <div className="flex flex-col sm:flex-row sm:justify-between gap-1">
      <span className="text-xs text-muted-foreground">{label}{isYou && <span className="ml-1 text-primary">(you)</span>}</span>
      <span className="font-mono text-xs text-muted-foreground break-all">{wallet ?? "—"}</span>
    </div>
  );
}

function LinkedOrder({ label, id, isYours }: { label: string; id: string; isYours: boolean }) {
  if (isYours) {
    return (
      <div className="flex justify-between items-center gap-2">
        <span className="text-xs text-muted-foreground">{label} <span className="text-primary">(you)</span></span>
        <Link
          href={`/orders/${id}`}
          className="font-mono text-xs text-primary hover:underline"
        >
          #{shortId(id)} →
        </Link>
      </div>
    );
  }
  return (
    <div className="flex justify-between items-center gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="font-mono text-xs text-muted-foreground">#{shortId(id)}</span>
    </div>
  );
}
