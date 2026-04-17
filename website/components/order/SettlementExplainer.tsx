interface Props {
  denomination: string;
  mode?: "hedge-perspective" | "cover-perspective";
}

export function SettlementExplainer({ denomination, mode = "cover-perspective" }: Props) {
  return (
    <section className="rounded-lg border border-border">
      <h2 className="bg-gray-200 dark:bg-gray-800 px-4 py-2 text-sm font-medium rounded-t-lg">
        Settlement
      </h2>
      <div className="px-4 py-3 text-xs text-muted-foreground space-y-1.5">
        {mode === "cover-perspective" ? (
          <>
            <p>
              <span className="font-medium text-foreground">If the event occurs</span> — the payout
              condition is met during the contract period. The coverage ({denomination}) is
              transferred to the hedge party.
            </p>
            <p>
              <span className="font-medium text-foreground">If the event does not occur</span> — the
              contract expires. The coverage is returned to you. You keep the hedge premium already
              received at match time.
            </p>
          </>
        ) : (
          <>
            <p>
              <span className="font-medium text-foreground">If the event occurs</span> — the payout
              condition is met during the contract period. You receive the coverage ({denomination})
              from the cover party.
            </p>
            <p>
              <span className="font-medium text-foreground">If the event does not occur</span> — the
              contract expires. Your hedge premium is retained by the cover party.
            </p>
          </>
        )}
        <p>
          Settlement is automatic via the Chainlink oracle reading live NOAA space weather data.
        </p>
      </div>
    </section>
  );
}
