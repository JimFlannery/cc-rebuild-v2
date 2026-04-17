export const metadata = { title: "Notifications | ConditionCover" };

export default function NotificationsPage() {
  return (
    <main className="mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-semibold mb-2">Notifications</h1>
      <p className="text-sm text-muted-foreground mb-8">
        Alerts for contract events, settlement outcomes, and order matching.
      </p>

      <div className="rounded-lg border border-border px-6 py-16 text-center">
        <p className="text-lg font-medium mb-2">Coming Soon</p>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          Notifications for order matching, contract settlement, APY changes, and space weather
          alerts are under development. Check back soon.
        </p>
      </div>
    </main>
  );
}
