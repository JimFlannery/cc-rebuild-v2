import { getLoopSettings } from "@/app/_actions/getLoopSettings";
import { getTokenPrices } from "@/app/_actions/prices";
import { getOpenLoopOrders } from "@/app/_actions/getOpenLoopOrders";
import { getTiers } from "@/app/_actions/getTiers";
import { YieldBoostPage } from "./YieldBoostPage";

export const metadata = {
  title: "Yield Boost | ConditionCover",
};

export default async function YieldBoostServerPage() {
  const [settings, prices, openOrders, tiers] = await Promise.all([
    getLoopSettings(),
    getTokenPrices(),
    getOpenLoopOrders(),
    getTiers(),
  ]);

  return (
    <main className="mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Yield Boost</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Delta-neutral looping for high-capacity Cover parties. Match with a counterparty to deploy
          leveraged SSTM coverage and amplify your APY — with no net directional risk.
        </p>
      </div>
      <YieldBoostPage settings={settings} prices={prices} openOrders={openOrders} tiers={tiers} />
    </main>
  );
}
