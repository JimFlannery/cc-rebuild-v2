import { cn } from "@/lib/utils";

export interface OrderDetailsGridProps {
  coverage: number;
  coverageFilled: number;
  payoutProbability: number;
  contractDuration: number;
  hedgePremium: number;
  denomination: string;
  currentAPY: number | null;
  maxAPY: number | null;
  formattedExpiration: string | null;
}

export function OrderDetailsGrid({
  coverage, coverageFilled, payoutProbability, contractDuration,
  hedgePremium, denomination, currentAPY, maxAPY, formattedExpiration,
}: OrderDetailsGridProps) {
  return (
    <section className="rounded-lg border border-border">
      <h2 className="bg-gray-200 dark:bg-gray-800 px-4 py-2 text-sm font-medium rounded-t-lg">
        Order Details
      </h2>
      <div className="px-4 py-4 grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4 text-sm">
        <DetailItem label="Coverage Sought" value={`$${coverage.toLocaleString()}`} />
        <DetailItem label="Coverage Filled" value={`$${coverageFilled.toLocaleString()}`} />
        <DetailItem
          label="Payout Probability"
          value={`${(payoutProbability * 100).toFixed(4)}%`}
          valueClass="text-red-500 dark:text-red-400"
        />
        <DetailItem label="Contract Duration" value={`${contractDuration} days`} />
        <DetailItem label="Hedge Premium" value={`$${hedgePremium.toFixed(2)}`} />
        <DetailItem label="Currency" value={denomination} />
        <DetailItem
          label="Current APY"
          value={currentAPY != null && currentAPY > 0 ? `${(currentAPY * 100).toFixed(1)}%` : "—"}
          valueClass="text-green-600 dark:text-green-400"
        />
        <DetailItem
          label="Max APY"
          value={maxAPY != null && maxAPY > 0 ? `${(maxAPY * 100).toFixed(1)}%` : "—"}
          valueClass="text-green-600 dark:text-green-400"
        />
        <DetailItem label="Order Expires" value={formattedExpiration ?? "Good-till-cancelled"} />
      </div>
    </section>
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
      <p className={cn("font-medium", valueClass)}>{value}</p>
    </div>
  );
}
