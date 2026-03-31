import { getMarketMetrics } from "@/app/_actions/getDashboardMetrics";
import { RiskManagement } from "./RiskManagement";

export const metadata = { title: "Dashboards | ConditionCover" };

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { notation: "compact", compactDisplay: "short" }).format(n);

function MetricCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="bg-slate-200 dark:bg-slate-800 rounded-sm px-3 py-2 flex flex-col gap-1 min-w-36">
      <div className="text-xs opacity-60">{label}</div>
      <div className="text-2xl font-semibold opacity-70 dark:opacity-80 tabular-nums">{value}</div>
      <div className="text-xs opacity-50">{sub}</div>
    </div>
  );
}

function InfoTooltip({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative group inline-block">
      <button
        type="button"
        className="flex h-4 w-4 items-center justify-center rounded-full border border-blue-700 dark:border-blue-300 text-blue-700 dark:text-blue-300 text-[10px] leading-none"
        aria-label="More information"
      >
        i
      </button>
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-80 rounded-md bg-foreground px-3 py-2 text-xs text-background shadow-lg opacity-0 group-hover:opacity-100 pointer-events-none z-10 whitespace-normal">
        {children}
        <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-foreground" />
      </div>
    </div>
  );
}

export default async function DashboardsPage() {
  const m = await getMarketMetrics();

  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const today = new Date();
  const dayToday = dayNames[today.getDay()];
  const dayTomorrow = dayNames[(today.getDay() + 1) % 7];
  const dayNext = dayNames[(today.getDay() + 2) % 7];

  return (
    <main className="mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 py-8 space-y-10">
      <h1 className="text-2xl font-semibold">Dashboards</h1>

      {/* ── Market Metrics ─────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold opacity-70">Market Metrics</h2>
        <div className="flex flex-wrap gap-3">
          <MetricCard
            label="Cover Supply"
            value={`$${fmt(m.coverSupply)}`}
            sub={`${m.coverSupplyCount} open cover order${m.coverSupplyCount === 1 ? "" : "s"}`}
          />
          <MetricCard
            label="Cover Demand"
            value={`$${fmt(m.coverDemand)}`}
            sub={`${m.coverDemandCount} open hedge order${m.coverDemandCount === 1 ? "" : "s"}`}
          />
          <MetricCard
            label="Premiums Earned"
            value={`$${fmt(m.premiumsEarned)}`}
            sub="by cover parties"
          />
          <MetricCard
            label="Cover Secured"
            value={`$${fmt(m.coverSecured)}`}
            sub="by hedge parties"
          />
          <MetricCard
            label="Token Rewards Earned"
            value={`$${fmt(m.tokenRewardsEarned)}`}
            sub="by cover parties (in SSTM)"
          />
          <MetricCard
            label="Total Income Earned"
            value={`$${fmt(m.totalIncomeEarned)}`}
            sub="by cover parties"
          />
          <MetricCard
            label="TVL in SSTM Token"
            value={`$${fmt(m.tvlSstm)}`}
            sub={`${m.tvlSstmCount} active contract${m.tvlSstmCount === 1 ? "" : "s"}`}
          />
          <MetricCard
            label="TVL in USDC"
            value={`$${fmt(m.tvlUsdc)}`}
            sub={`${m.tvlUsdcCount} active contract${m.tvlUsdcCount === 1 ? "" : "s"}`}
          />
        </div>
      </section>

      {/* ── Space Weather ───────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold opacity-70">Space Weather</h2>
        <div className="flex flex-wrap gap-3">

          {/* Kp Index Forecast */}
          <div className="bg-slate-200 dark:bg-slate-800 rounded-sm px-3 py-2 text-sm min-w-48">
            <div className="font-semibold flex justify-center opacity-70 mb-1">Kp Index Forecast
              <span className="ml-1">
                <InfoTooltip>
                  The Kp index is a geomagnetic activity index based on data from magnetometers around
                  the world. It can be used to make a rough estimate of the current global geomagnetic
                  conditions.
                </InfoTooltip>
              </span>
            </div>
            <div className="grid grid-cols-3 gap-x-2 text-xs border-b border-muted-foreground mb-1 pb-0.5 opacity-60">
              <div />
              <div>Min</div>
              <div>Max</div>
            </div>
            {[dayToday, dayTomorrow, dayNext].map((day) => (
              <div key={day} className="grid grid-cols-3 gap-x-2 text-xs opacity-70">
                <div className="min-w-10">{day}</div>
                <div>—</div>
                <div>—</div>
              </div>
            ))}
          </div>

          {/* Mid-Latitudes */}
          <div className="bg-slate-200 dark:bg-slate-800 rounded-sm px-3 py-2 text-sm min-w-48">
            <div className="font-semibold flex justify-center opacity-70 mb-1 gap-1">
              Mid-Latitudes
              <InfoTooltip>
                <strong>Geomagnetic Storms</strong>
                <br />
                Probabilities for significant disturbances in Earth&apos;s magnetic field are given for
                three activity levels: active, minor storm, and strong storm.
                <br /><br />
                Active: Kp = 4 &nbsp;|&nbsp; Minor storm: Kp = 5 &nbsp;|&nbsp; Strong storm: Kp &gt; 6
                <br /><br />
                High latitude: ≥ 60° magnetic latitude. Mid-latitudes: 50°–60°. Low latitude: &lt; 50°.
              </InfoTooltip>
            </div>
            <div className="grid grid-cols-3 gap-x-2 text-xs border-b border-muted-foreground mb-1 pb-0.5 opacity-60">
              <div />
              <div className="text-right">0–24 hr</div>
              <div className="text-right">24–48 hr</div>
            </div>
            {["Active", "Minor", "Strong"].map((level) => (
              <div key={level} className="grid grid-cols-3 gap-x-2 text-xs opacity-70">
                <div>{level}</div>
                <div className="text-right">—</div>
                <div className="text-right">—</div>
              </div>
            ))}
          </div>

          {/* High-Latitudes */}
          <div className="bg-slate-200 dark:bg-slate-800 rounded-sm px-3 py-2 text-sm min-w-48">
            <div className="font-semibold flex justify-center opacity-70 mb-1 gap-1">
              High-Latitudes
              <InfoTooltip>
                <strong>Geomagnetic Storms</strong>
                <br />
                Probabilities for significant disturbances in Earth&apos;s magnetic field are given for
                three activity levels: active, minor storm, and strong storm.
                <br /><br />
                Active: Kp = 4 &nbsp;|&nbsp; Minor storm: Kp = 5 &nbsp;|&nbsp; Strong storm: Kp &gt; 6
                <br /><br />
                High latitude: ≥ 60° magnetic latitude. Mid-latitudes: 50°–60°. Low latitude: &lt; 50°.
              </InfoTooltip>
            </div>
            <div className="grid grid-cols-3 gap-x-2 text-xs border-b border-muted-foreground mb-1 pb-0.5 opacity-60">
              <div />
              <div className="text-right">0–24 hr</div>
              <div className="text-right">24–48 hr</div>
            </div>
            {["Active", "Minor", "Strong"].map((level) => (
              <div key={level} className="grid grid-cols-3 gap-x-2 text-xs opacity-70">
                <div>{level}</div>
                <div className="text-right">—</div>
                <div className="text-right">—</div>
              </div>
            ))}
          </div>

          {/* Dst note */}
          <div className="bg-slate-200 dark:bg-slate-800 rounded-sm px-3 py-2 text-sm min-w-48 flex flex-col gap-1">
            <div className="font-semibold opacity-70 flex items-center gap-1">
              Dst Index
              <InfoTooltip>
                The Disturbance Storm Time (Dst) index measures the severity of geomagnetic storms in
                nanoTeslas (nT). It is based on the horizontal component of Earth&apos;s magnetic field
                at near-equatorial observatories. Lower (more negative) values indicate stronger storms.
              </InfoTooltip>
            </div>
            <div className="text-2xl font-semibold opacity-70 dark:opacity-80">—</div>
            <div className="text-xs opacity-50">current value (nT)</div>
          </div>

        </div>
        <p className="text-xs text-muted-foreground">Live space weather data integration coming soon.</p>
      </section>

      {/* ── Risk Management ─────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold opacity-70">Risk Management</h2>
        <RiskManagement />
      </section>
    </main>
  );
}
