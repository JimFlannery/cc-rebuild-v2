import { getOpenHedgeOrders } from "@/app/_actions/getOpenHedgeOrders";
import { getTiers } from "@/app/_actions/getTiers";
import { getTokenPrices } from "@/app/_actions/prices";
import { MarketsClient } from "./MarketsClient";

export const metadata = { title: "Markets | ConditionCover" };

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function str(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}
function num(v: string | string[] | undefined): number | undefined {
  const s = str(v);
  return s !== undefined ? Number(s) : undefined;
}

export default async function MarketsPage({ searchParams }: Props) {
  const sp = await searchParams;

  const filters = {
    indexName:      str(sp.index),
    denomination:   str(sp.denom),
    minCoverage:    num(sp.minCov),
    maxCoverage:    num(sp.maxCov),
    minProbability: num(sp.minProb),
    maxProbability: num(sp.maxProb),
    minDuration:    num(sp.minDur),
    maxDuration:    num(sp.maxDur),
  };

  const [{ orders, totalCount, spaceWeatherCount }, tiers, prices] = await Promise.all([
    getOpenHedgeOrders(filters),
    getTiers(),
    getTokenPrices(),
  ]);

  return (
    <main className="mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Markets</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Open hedge orders seeking cover. Click any order to provide coverage and earn premiums and SSTM rewards.
        </p>
      </div>
      <MarketsClient
        orders={orders}
        tiers={tiers}
        prices={prices}
        totalCount={totalCount}
        spaceWeatherCount={spaceWeatherCount}
        initialFilters={filters}
      />
    </main>
  );
}
