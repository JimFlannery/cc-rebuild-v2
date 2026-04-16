import { notFound } from "next/navigation";
import Link from "next/link";
import { getOrderById } from "@/app/_actions/getOrderById";
import { getTiers } from "@/app/_actions/getTiers";
import { getTokenPrices } from "@/app/_actions/prices";
import { CoverForm } from "./CoverForm";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  const order = await getOrderById(id);
  if (!order) return {};
  const index = order.indexName.includes("Disturbance") ? "Dst"
    : order.indexName.includes("Planetary") ? "Kp"
    : order.indexName;
  return { title: `Cover Order — ${index} | ConditionCover` };
}

export default async function OrderDetailPage({ params }: Props) {
  const { id } = await params;
  const [order, tiers, prices] = await Promise.all([
    getOrderById(id),
    getTiers(),
    getTokenPrices(),
  ]);

  if (!order) notFound();

  const isOpen = !order.orderTaken;

  const indexShort = order.indexName.includes("Disturbance") ? "Dst"
    : order.indexName.includes("Planetary") ? "Kp"
    : order.indexName.includes("X-Ray") ? "Solar X-Ray Flux"
    : order.indexName.includes("Proton") ? "Solar Proton Flux"
    : "Solar Radio Flux";

  const conditionDisplay = `${indexShort} ${order.indexLevel < 0 ? `< ${order.indexLevel}` : `≥ ${order.indexLevel / 100}`} ${order.indexUnit}`;

  return (
    <main className="mx-auto max-w-5xl w-full px-4 sm:px-6 lg:px-8 py-8">

      {/* Back link */}
      <Link
        href="/markets"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
      >
        ← Back to Markets
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-6">

        {/* ── Left: Order details ─────────────────────────────────────────────── */}
        <div className="space-y-5">

          {/* Header */}
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
            <h1 className="text-xl font-semibold">
              {conditionDisplay}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {order.indexName} hedge order seeking cover
            </p>
          </div>

          {/* Primary stats */}
          <section className="rounded-lg border border-border">
            <h2 className="bg-gray-200 dark:bg-gray-800 px-4 py-2 text-sm font-medium rounded-t-lg">
              Order Details
            </h2>
            <div className="px-4 py-4 grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4 text-sm">
              <DetailItem label="Coverage Sought" value={`$${order.coverage.toLocaleString()}`} />
              <DetailItem label="Coverage Filled" value={`$${order.coverageFilled.toLocaleString()}`} />
              <DetailItem
                label="Payout Probability"
                value={`${(order.payoutProbability * 100).toFixed(4)}%`}
                valueClass="text-red-500 dark:text-red-400"
              />
              <DetailItem label="Contract Duration" value={`${order.contractDuration} days`} />
              <DetailItem
                label="Hedge Premium"
                value={`$${(order.adjustedHedgePremium ?? order.hedgePremium).toFixed(2)}`}
              />
              <DetailItem label="Currency" value={order.denomination} />
              <DetailItem
                label="Order Expires"
                value={order.formattedExpiration ?? "Good-till-cancelled"}
              />
            </div>
          </section>

          {/* Hedge party info */}
          <section className="rounded-lg border border-border">
            <h2 className="bg-gray-200 dark:bg-gray-800 px-4 py-2 text-sm font-medium rounded-t-lg">
              Hedge Party
            </h2>
            <div className="px-4 py-3 text-sm">
              <p className="font-mono text-xs text-muted-foreground break-all">{order.walletAddress}</p>
            </div>
          </section>

          {/* What happens at settlement */}
          <section className="rounded-lg border border-border">
            <h2 className="bg-gray-200 dark:bg-gray-800 px-4 py-2 text-sm font-medium rounded-t-lg">
              Settlement
            </h2>
            <div className="px-4 py-3 text-xs text-muted-foreground space-y-1.5">
              <p>
                <span className="font-medium text-foreground">If the event occurs</span> — the payout
                condition is met during the contract period. The coverage ({order.denomination}) is
                transferred to the hedge party.
              </p>
              <p>
                <span className="font-medium text-foreground">If the event does not occur</span> — the
                contract expires. The coverage is returned to you. You keep the hedge premium already
                received at match time.
              </p>
              <p>
                Settlement is automatic via the Chainlink oracle reading live NOAA space weather data.
              </p>
            </div>
          </section>
        </div>

        {/* ── Right: Cover form ───────────────────────────────────────────────── */}
        <div>
          <CoverForm order={order} tiers={tiers} prices={prices} />
        </div>
      </div>
    </main>
  );
}

function DetailItem({
  label, value, valueClass,
}: {
  label: string; value: string; valueClass?: string;
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`font-medium ${valueClass ?? ""}`}>{value}</p>
    </div>
  );
}
