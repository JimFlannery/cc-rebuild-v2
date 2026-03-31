import { getTiers } from "@/app/_actions/getTiers";
import { getTokenPrices } from "@/app/_actions/prices";
import { HedgeForm } from "./HedgeForm";

export const metadata = {
  title: "Hedge | ConditionCover",
};

export default async function HedgePage() {
  const [tiers, prices] = await Promise.all([getTiers(), getTokenPrices()]);

  return (
    <main className="mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Place a Hedge Order</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Buy protection against a space weather event. Your premium is locked in escrow until matched.
        </p>
      </div>
      <HedgeForm tiers={tiers} prices={prices} />
    </main>
  );
}
