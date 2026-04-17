import { notFound } from "next/navigation";
import Link from "next/link";
import { getOrderById } from "@/app/_actions/getOrderById";
import { getTiers } from "@/app/_actions/getTiers";
import { getTokenPrices } from "@/app/_actions/prices";
import { matchTier } from "@/lib/orderConstants";
import { longIndex, formatCondition } from "@/lib/orderFormat";
import { OrderDetailsGrid } from "@/components/order/OrderDetailsGrid";
import { SettlementExplainer } from "@/components/order/SettlementExplainer";
import { CoverForm } from "./CoverForm";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  const order = await getOrderById(id);
  if (!order) return {};
  return { title: `Cover Order — ${longIndex(order.indexName)} | ConditionCover` };
}

export default async function MarketOrderDetailPage({ params }: Props) {
  const { id } = await params;
  const [order, tiers, prices] = await Promise.all([
    getOrderById(id),
    getTiers(),
    getTokenPrices(),
  ]);

  if (!order) notFound();

  const isOpen = !order.orderTaken;

  const filled = order.coverageFilled ?? 0;
  const currentTier = filled > 0 ? matchTier(tiers, filled) : null;
  const currentAPY = currentTier?.APY ?? 0;
  const maxTier = matchTier(tiers, order.coverage);
  const maxAPY = maxTier?.APY ?? 0;

  const indexShort = longIndex(order.indexName);
  const conditionDisplay = formatCondition(order.indexName, order.indexLevel, order.indexUnit);

  return (
    <main className="mx-auto max-w-5xl w-full px-4 sm:px-6 lg:px-8 py-8">

      <Link
        href="/markets"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
      >
        ← Back to Markets
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-6">

        <div className="space-y-5">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                {order.denomination} · {indexShort}
              </span>
              {!isOpen && (
                <span className="text-xs font-medium text-muted-foreground border border-border rounded px-2 py-0.5">
                  Already Matched
                </span>
              )}
            </div>
            <h1 className="text-xl font-semibold">{conditionDisplay}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {order.indexName} hedge order seeking cover
            </p>
          </div>

          <OrderDetailsGrid
            coverage={order.coverage}
            coverageFilled={order.coverageFilled}
            payoutProbability={order.payoutProbability}
            contractDuration={order.contractDuration}
            hedgePremium={order.adjustedHedgePremium ?? order.hedgePremium}
            denomination={order.denomination}
            currentAPY={currentAPY}
            maxAPY={maxAPY}
            formattedExpiration={order.formattedExpiration}
          />

          <section className="rounded-lg border border-border">
            <h2 className="bg-gray-200 dark:bg-gray-800 px-4 py-2 text-sm font-medium rounded-t-lg">
              Hedge Party
            </h2>
            <div className="px-4 py-3 text-sm">
              <p className="font-mono text-xs text-muted-foreground break-all">{order.walletAddress}</p>
            </div>
          </section>

          <SettlementExplainer denomination={order.denomination} mode="cover-perspective" />
        </div>

        <div>
          <CoverForm order={order} tiers={tiers} prices={prices} />
        </div>
      </div>
    </main>
  );
}
