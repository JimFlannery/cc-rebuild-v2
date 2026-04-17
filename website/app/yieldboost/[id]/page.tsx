import { notFound } from "next/navigation";
import Link from "next/link";
import { getLoopOrderById } from "@/app/_actions/getLoopOrderById";
import { getLoopSettings } from "@/app/_actions/getLoopSettings";
import { getTokenPrices } from "@/app/_actions/prices";
import { getTiers } from "@/app/_actions/getTiers";
import { MatchForm } from "./MatchForm";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  const order = await getLoopOrderById(id);
  if (!order) return {};
  const kind = order.isCommunityOrder ? "Community Pool" : "P2P Order";
  return { title: `Yield Boost ${kind} | ConditionCover` };
}

export default async function YieldBoostOrderDetailPage({ params }: Props) {
  const { id } = await params;
  const [order, settings, prices, tiers] = await Promise.all([
    getLoopOrderById(id),
    getLoopSettings(),
    getTokenPrices(),
    getTiers(),
  ]);

  if (!order) notFound();

  const kindLabel = order.isCommunityOrder ? "Community Pool" : "Peer-to-Peer Order";
  const kindBlurb = order.isCommunityOrder
    ? "Pool-based delta-neutral position. Contribute any amount above the minimum — the pool fills over time."
    : "Direct delta-neutral match with the counterparty. Matching takes the entire order in one transaction.";

  return (
    <main className="mx-auto max-w-5xl w-full px-4 sm:px-6 lg:px-8 py-8">

      <Link
        href="/yieldboost"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
      >
        ← Back to Yield Boost
      </Link>

      <div className="space-y-1 mb-6">
        <div className="flex items-center gap-3 flex-wrap">
          <span className={
            order.isCommunityOrder
              ? "px-2 py-0.5 rounded text-xs font-medium bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300"
              : "px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
          }>
            {kindLabel}
          </span>
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            SSTM · Dst &lt; −850 nT · {order.contractDuration}-day contracts
          </span>
        </div>
        <h1 className="text-xl font-semibold">
          {order.isCommunityOrder ? "Join Community Pool" : "Match Peer-to-Peer Order"}
        </h1>
        <p className="text-sm text-muted-foreground">{kindBlurb}</p>
      </div>

      <MatchForm order={order} settings={settings} prices={prices} tiers={tiers} />
    </main>
  );
}
