"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import { cn } from "@/lib/utils";
import { CONTRACT_DURATIONS, matchTier } from "@/lib/orderConstants";
import { createLoopOrder } from "@/app/_actions/createLoopOrder";
import { Tooltip } from "@/components/tooltip";
import type { LoopSettings } from "@/app/_actions/getLoopSettings";
import type { TokenPrices } from "@/app/_actions/prices";
import type { OpenLoopOrder } from "@/app/_actions/getOpenLoopOrders";
import type { Tier } from "@/app/_actions/getTiers";

// ── Types ────────────────────────────────────────────────────────────────────

interface Props {
  settings: LoopSettings;
  prices: TokenPrices;
  openOrders: OpenLoopOrder[];
  tiers: Tier[];
}

interface Projections {
  leverage: number;
  totalCoverUsd: number;
  totalLoansUsd: number;
  grossAnnualRewardsUsd: number;
  annualInterestUsd: number;
  upfrontFeeUsd: number;
  netAnnualIncomeUsd: number;
  effectiveAPY: number;
  amplification: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(date: Date): string {
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const d = date.getDate().toString().padStart(2, "0");
  const h = date.getHours();
  const m = date.getMinutes().toString().padStart(2, "0");
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = (h % 12 || 12).toString().padStart(2, "0");
  return `${d} ${months[date.getMonth()]} ${date.getFullYear()} ${h12}:${m} ${ampm}`;
}

function shortWallet(address: string | null): string {
  if (!address) return "Platform";
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

function displayExpiration(order: OpenLoopOrder): string {
  if (order.formattedExpiration) return order.formattedExpiration;
  if (!order.expiration) return "—";
  const d = new Date(order.expiration);
  if (isNaN(d.getTime())) return "—";
  return formatDate(d);
}

function calcProjections(
  coverageUsd: number,
  numLoops: number,
  settings: LoopSettings
): Projections | null {
  if (coverageUsd <= 0 || numLoops <= 0) return null;

  const ltv = settings.LoopLTV;
  // Geometric series: sum of ltv^k for k=0..numLoops
  const leverage = (1 - Math.pow(ltv, numLoops + 1)) / (1 - ltv);
  const totalCoverUsd = coverageUsd * leverage;
  const totalLoansUsd = coverageUsd * (leverage - 1);

  const grossAnnualRewardsUsd = totalCoverUsd * settings.LoopRewardAPY;
  const annualInterestUsd = totalLoansUsd * settings.LoopLoanAPR;
  const upfrontFeeUsd = totalCoverUsd * settings.LoopFeePct;

  const netAnnualIncomeUsd = grossAnnualRewardsUsd - annualInterestUsd - upfrontFeeUsd;
  const effectiveAPY = netAnnualIncomeUsd / coverageUsd;
  const amplification = effectiveAPY / settings.LoopRewardAPY;

  return {
    leverage,
    totalCoverUsd,
    totalLoansUsd,
    grossAnnualRewardsUsd,
    annualInterestUsd,
    upfrontFeeUsd,
    netAnnualIncomeUsd,
    effectiveAPY,
    amplification,
  };
}

function usd(n: number, decimals = 0): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}

function pct(n: number, decimals = 2): string {
  return `${(n * 100).toFixed(decimals)}%`;
}

// ── Main component ───────────────────────────────────────────────────────────

export function YieldBoostPage({ settings, prices, openOrders, tiers }: Props) {
  const [tab, setTab] = useState<"open" | "create">("open");

  return (
    <div className="space-y-6">
      {/* Tab bar */}
      <div className="flex gap-1 border-b border-border">
        {(["open", "create"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "px-5 py-2 text-sm font-medium border-b-2 transition-colors",
              tab === t
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {t === "open" ? `Open Orders${openOrders.length > 0 ? ` (${openOrders.length})` : ""}` : "Place P2P Order"}
          </button>
        ))}
      </div>

      {tab === "open" && (
        <OpenOrdersTable orders={openOrders} settings={settings} tiers={tiers} />
      )}
      {tab === "create" && (
        <CreateOrderForm settings={settings} prices={prices} tiers={tiers} />
      )}
    </div>
  );
}

// ── Create Order Form ─────────────────────────────────────────────────────────

function CreateOrderForm({ settings, prices, tiers }: { settings: LoopSettings; prices: TokenPrices; tiers: Tier[] }) {
  const { connected, publicKey } = useWallet();

  // Form state
  const [coverage, setCoverage] = useState<string>("1000000");
  const [numLoops, setNumLoops] = useState<number>(settings.LoopDefaultLoops);
  const [contractDuration, setContractDuration] = useState<string>("");
  const [orderDurationDays, setOrderDurationDays] = useState<string>("");
  const [orderDurationHours, setOrderDurationHours] = useState<string>("");

  // UI state
  const [showDetails, setShowDetails] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, boolean>>({});
  const [result, setResult] = useState<{ ok: boolean; orderId?: string; error?: string } | null>(null);

  // Derived
  const coverageNum = Math.max(0, parseInt(coverage.replace(/,/g, ""), 10) || 0);
  const durationNum = parseInt(contractDuration, 10) || 0;
  const matchedTier = matchTier(tiers, coverageNum);
  const rewardAPY = matchedTier?.APY ?? 0;
  const tierLoanAPR = matchedTier?.LoopLoanAPR ?? settings.LoopLoanAPR;
  const effectiveSettings = { ...settings, LoopRewardAPY: rewardAPY, LoopLoanAPR: tierLoanAPR };
  const proj = calcProjections(coverageNum, numLoops, effectiveSettings);

  const orderDurationHrs =
    (parseInt(orderDurationDays, 10) || 0) * 24 +
    (parseInt(orderDurationHours, 10) || 0);
  const orderExpiresAt = orderDurationHrs > 0
    ? new Date(Date.now() + orderDurationHrs * 3_600_000)
    : null;

  function validate(): Record<string, boolean> {
    const e: Record<string, boolean> = {};
    if (!contractDuration) e.contractDuration = true;
    if (!orderDurationDays && !orderDurationHours) e.orderDuration = true;
    if (coverageNum < P2P_MIN_USD) e.coverage = true;
    if (!acknowledged) e.acknowledged = true;
    return e;
  }

  const isValid = Object.keys(validate()).length === 0;

  function handleSubmitClick() {
    const errors = validate();
    setFieldErrors(errors);
    if (Object.keys(errors).length === 0) setShowConfirm(true);
  }

  async function handleConfirm() {
    setShowConfirm(false);
    setSubmitting(true);
    setResult(null);

    try {
      if (!publicKey) throw new Error("Wallet not connected");
      if (!proj) throw new Error("Invalid projections");

      // TODO: Solana on-chain call (create escrow + loop set) once smart contracts are ready

      const { id } = await createLoopOrder({
        coverageUsd: coverageNum,
        numLoops,
        contractDuration: durationNum,
        orderDuration: orderDurationHrs || null,
        expirationDate: orderExpiresAt?.toISOString() ?? null,
        formattedExpiration: orderExpiresAt ? formatDate(orderExpiresAt) : null,
        walletAddress: publicKey.toBase58(),
        effectiveAPY: proj.effectiveAPY,
        leverage: proj.leverage,
        totalCoverUsd: proj.totalCoverUsd,
        upfrontFeeUsd: proj.upfrontFeeUsd,
      });

      setResult({ ok: true, orderId: id });
      setCoverage("1000000");
      setNumLoops(settings.LoopDefaultLoops);
      setContractDuration("");
      setOrderDurationDays("");
      setOrderDurationHours("");
      setAcknowledged(false);
      setFieldErrors({});
    } catch (err) {
      setResult({ ok: false, error: err instanceof Error ? err.message : String(err) });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-[5fr_3fr] gap-6">

        {/* ── Left panel ─────────────────────────────────────────────────────── */}
        <div className="space-y-6">

          {/* Section 1: Order Parameters */}
          <section className="rounded-lg border border-border space-y-2">
            <h2 className="w-full bg-gray-200 dark:bg-gray-800 pl-3 pr-2 py-1.5 font-medium rounded-t-lg">
              <span className="font-bold">1.&nbsp;&nbsp;</span>Order Parameters
            </h2>

            {/* Coverage Amount */}
            <div className="px-6 pt-2 pb-3">
              <label className="flex items-center gap-1.5 text-sm font-medium mb-2">
                Coverage Amount
                <Tooltip wide content={<>The amount of SSTM coverage you will provide. Both you and your matched counterparty each put up this amount. At {pct(settings.LoopRewardAPY)} APY, $1,000,000 maximises your earnings in the highest platform tier.</>} />
              </label>
              <div className="relative w-64">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm select-none">$</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={coverageNum > 0 ? coverageNum.toLocaleString("en-US") : ""}
                  onChange={(e) => {
                    const raw = e.target.value.replace(/,/g, "");
                    if (/^\d*$/.test(raw) && Number(raw) <= 100_000_000) {
                      setCoverage(raw);
                      setFieldErrors((er) => ({ ...er, coverage: false }));
                    }
                  }}
                  placeholder="1,000,000"
                  className={cn(
                    "w-full rounded-md border border-border bg-background pl-7 pr-3 py-2 text-sm",
                    fieldErrors.coverage && "ring-2 ring-red-500"
                  )}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1">Currency: SSTM &nbsp;·&nbsp; ≈ {Math.round(coverageNum / prices.SSTM).toLocaleString("en-US")} tokens at current price</p>
              {fieldErrors.coverage && coverageNum > 0 && coverageNum < P2P_MIN_USD && (
                <p className="text-xs text-red-500 mt-1">Minimum coverage for P2P orders is ${P2P_MIN_USD.toLocaleString("en-US")}</p>
              )}
            </div>

            <hr className="border-border mx-6" />

            {/* Number of Loops */}
            <div className="px-6 pt-2 pb-3">
              <label className="flex items-center gap-1.5 text-sm font-medium mb-2">
                Number of Loops
                <Tooltip wide content={<>Each loop issues an SSTM loan from the treasury at {pct(settings.LoopLTV)} LTV and deploys the proceeds into another offsetting contract pair, amplifying your yield. More loops = higher APY and more leverage.</>} />
              </label>
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min={1}
                  max={settings.LoopMaxLoops}
                  value={numLoops}
                  onChange={(e) => setNumLoops(parseInt(e.target.value, 10))}
                  className="w-48 accent-primary"
                />
                <span className="text-sm font-medium w-8 text-center">{numLoops}</span>
                {proj && (
                  <span className="text-xs text-muted-foreground">
                    {proj.leverage.toFixed(2)}× leverage &nbsp;·&nbsp; {pct(proj.effectiveAPY)} effective APY
                  </span>
                )}
              </div>
            </div>

            <hr className="border-border mx-6" />

            {/* Contract Duration */}
            <div className="px-6 pt-2 pb-3">
              <label className="flex items-center gap-1.5 text-sm font-medium mb-2">
                Contract Duration
                <Tooltip wide content={<>The length of each smart contract in the loop set. All contracts in your set share the same duration and expiration date.</>} />
              </label>
              <select
                value={contractDuration}
                onChange={(e) => { setContractDuration(e.target.value); setFieldErrors((er) => ({ ...er, contractDuration: false })); }}
                className={cn(
                  "w-1/3 rounded-md border border-border bg-background px-3 py-2 text-sm",
                  fieldErrors.contractDuration && "ring-2 ring-red-500"
                )}
              >
                <option value="">Select duration…</option>
                {CONTRACT_DURATIONS.map((d) => (
                  <option key={d} value={d}>{d} day{d > 1 ? "s" : ""}</option>
                ))}
              </select>
            </div>

            <hr className="border-border mx-6" />

            {/* Order Duration */}
            <div className="px-6 pt-2 pb-3 flex items-center justify-between">
              <div>
                <label className="flex items-center gap-1.5 text-sm font-medium mb-2">
                  Order Duration
                  <Tooltip wide content={<>How long your order stays open on the marketplace waiting for a counterparty to match. If unmatched after this period, the order is automatically cancelled.</>} />
                </label>
                <div className="flex gap-3">
                  <select
                    value={orderDurationDays}
                    onChange={(e) => { setOrderDurationDays(e.target.value); setFieldErrors((er) => ({ ...er, orderDuration: false })); }}
                    className={cn(
                      "rounded-md border border-border bg-background px-3 py-2 text-sm",
                      fieldErrors.orderDuration && !orderDurationHours && "ring-2 ring-red-500"
                    )}
                  >
                    <option value="">Select days…</option>
                    {Array.from({ length: 90 }, (_, i) => i + 1).map((d) => (
                      <option key={d} value={d}>{d} day{d > 1 ? "s" : ""}</option>
                    ))}
                  </select>
                  <select
                    value={orderDurationHours}
                    onChange={(e) => { setOrderDurationHours(e.target.value); setFieldErrors((er) => ({ ...er, orderDuration: false })); }}
                    className={cn(
                      "rounded-md border border-border bg-background px-3 py-2 text-sm",
                      fieldErrors.orderDuration && !orderDurationDays && "ring-2 ring-red-500"
                    )}
                  >
                    <option value="">Select hours…</option>
                    {Array.from({ length: 23 }, (_, i) => i + 1).map((h) => (
                      <option key={h} value={h}>{h} hour{h > 1 ? "s" : ""}</option>
                    ))}
                  </select>
                </div>
              </div>
              {orderExpiresAt && (
                <p className="text-xs text-muted-foreground">Expires: {formatDate(orderExpiresAt)}</p>
              )}
            </div>
          </section>

          {/* Section 2: Fixed Terms */}
          <section className="rounded-lg border border-border space-y-2">
            <h2 className="w-full bg-gray-200 dark:bg-gray-800 pl-3 pr-2 py-1.5 font-medium rounded-t-lg">
              <span className="font-bold">2.&nbsp;&nbsp;</span>Platform Terms
            </h2>
            <div className="px-6 py-4 grid grid-cols-2 sm:grid-cols-3 gap-x-8 gap-y-3 text-sm">
              <TermRow label="Trigger" value="Dst < −850 nT" sub="1.2% annual probability" />
              <TermRow label="Currency" value="SSTM" />
              <TermRow
                label="Reward APY"
                value={coverageNum > 0 ? pct(rewardAPY) : "—"}
                sub={matchedTier?.Name ?? undefined}
              />
              <TermRow label="Platform Fee" value={pct(settings.LoopFeePct)} sub="paid upfront in USDC" />
              <TermRow label="Loan APR" value={pct(tierLoanAPR)} sub="from treasury" />
              <TermRow label="Loan LTV" value={pct(settings.LoopLTV)} />
            </div>
            <p className="px-6 pb-4 text-xs text-muted-foreground">
              Premiums cancel out between counterparties — your net premium cost is zero.
              Treasury loans are issued in SSTM and repaid from your rewards pool at settlement.
              No liquidations apply; loans are ring-fenced to the marketplace.
            </p>
          </section>
        </div>

        {/* ── Right panel: Yield Projections ─────────────────────────────────── */}
        <div>
          <div className="rounded-lg border border-border space-y-4 sticky top-24">
            <h2 className="w-full bg-gray-200 dark:bg-gray-800 pl-3 pr-2 py-1.5 font-medium rounded-t-lg">
              <span className="font-bold">3.&nbsp;&nbsp;</span>Yield Projections
            </h2>
            <div className="px-6 pb-6 space-y-4">

              {proj ? (
                <>
                  <div className="space-y-2 text-sm">
                    <SummaryRow
                      label="Effective APY"
                      value={pct(proj.effectiveAPY)}
                      valueClass="text-green-600 dark:text-green-400 font-semibold"
                    />
                    <SummaryRow
                      label="APY Amplification"
                      value={`${proj.amplification.toFixed(2)}×`}
                      sub={`vs ${pct(rewardAPY)} base`}
                    />
                    <SummaryRow label="Leverage Factor" value={`${proj.leverage.toFixed(2)}×`} />
                    <SummaryRow label="Total Cover Deployed" value={usd(proj.totalCoverUsd)} />
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowDetails((v) => !v)}
                    className="text-xs text-primary underline underline-offset-2"
                  >
                    {showDetails ? "Hide details" : "Show details"}
                  </button>

                  {showDetails && (
                    <div className="space-y-1.5 text-sm border-t border-border pt-3">
                      <SummaryRow label="Your Supplied Cover" value={usd(coverageNum)} small />
                      <SummaryRow label="Treasury Loan" value={usd(proj.totalLoansUsd)} small />
                      <SummaryRow label="Gross Rewards" value={usd(proj.grossAnnualRewardsUsd)} small />
                      <SummaryRow label="Loan Interest Cost" value={`(${usd(proj.annualInterestUsd)})`} small />
                      <SummaryRow label="Contract Service Fee (USDC)" value={`(${usd(proj.upfrontFeeUsd)})`} small />
                      <div className="border-t border-border pt-1.5">
                        <SummaryRow label="Net Return" value={usd(proj.netAnnualIncomeUsd)} bold small />
                      </div>
                      {durationNum > 0 && (
                        <SummaryRow
                          label={`Income for ${durationNum}-day contract`}
                          value={usd(proj.netAnnualIncomeUsd * durationNum / 365)}
                          small
                        />
                      )}
                    </div>
                  )}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Enter a coverage amount to see projections.</p>
              )}

              {/* Acknowledgement + submit */}
              <div className="border-t border-border pt-4 space-y-3">
                <label
                  className={cn(
                    "flex items-start gap-2 text-xs cursor-pointer",
                    fieldErrors.acknowledged && "text-red-500"
                  )}
                >
                  <input
                    type="checkbox"
                    checked={acknowledged}
                    onChange={(e) => { setAcknowledged(e.target.checked); setFieldErrors((er) => ({ ...er, acknowledged: false })); }}
                    className="mt-0.5 accent-primary shrink-0"
                  />
                  <span>
                    I understand that matching this order will deploy multiple smart contracts and
                    agree to the{" "}
                    <a href="/legal" className="underline" target="_blank" rel="noopener noreferrer">
                      terms and legal disclaimer
                    </a>.
                  </span>
                </label>

                {!isValid && (
                  <p className="text-xs text-muted-foreground text-center">Complete all fields to continue</p>
                )}
                {!connected && (
                  <p className="text-xs text-amber-500 text-center">Connect your wallet to submit</p>
                )}

                <button
                  type="button"
                  onClick={handleSubmitClick}
                  disabled={submitting || !connected}
                  className="w-full rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {submitting ? "Submitting…" : "Place Loop Order"}
                </button>
              </div>

              {result && (
                <div
                  className={cn(
                    "rounded-md p-3 text-xs",
                    result.ok
                      ? "bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-200"
                      : "bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200"
                  )}
                >
                  {result.ok ? (
                    <p className="font-semibold">Order placed! Waiting for a counterparty to match.</p>
                  ) : (
                    <>
                      <p className="font-semibold">Submission failed</p>
                      <p className="mt-0.5 break-all">{result.error}</p>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Confirmation modal ────────────────────────────────────────────────── */}
      {showConfirm && proj && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-sm rounded-xl bg-background border border-border p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-semibold">Confirm Loop Order</h3>
            <p className="text-xs text-muted-foreground">
              Your order will appear on the marketplace. Once matched, the full loop set of contracts
              is deployed automatically.
            </p>
            <div className="space-y-2 text-sm">
              <SummaryRow label="Coverage" value={usd(coverageNum)} />
              <SummaryRow label="Loops" value={String(numLoops)} />
              <SummaryRow label="Leverage" value={`${proj.leverage.toFixed(2)}×`} />
              <SummaryRow label="Contract Duration" value={`${durationNum} days`} />
              <SummaryRow label="Effective APY" value={pct(proj.effectiveAPY)} valueClass="text-green-600 dark:text-green-400" />
              <SummaryRow label="Upfront Fee" value={usd(proj.upfrontFeeUsd)} sub="USDC" />
            </div>
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setShowConfirm(false)}
                className="flex-1 rounded-md border border-border px-4 py-2 text-sm hover:bg-accent transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                className="flex-1 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
              >
                Confirm & Submit
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── Open Orders Table ─────────────────────────────────────────────────────────

const COMMUNITY_MIN_USD = 2_000;
const P2P_MIN_USD = 50_000;

function CommunityOrderColumn({
  orders, connected, settings, tiers, onMatch, emptyMessage,
}: {
  orders: OpenLoopOrder[];
  connected: boolean;
  settings: LoopSettings;
  tiers: Tier[];
  onMatch: (o: OpenLoopOrder) => void;
  emptyMessage: string;
}) {
  if (orders.length === 0) {
    return (
      <div className="rounded-lg border border-border px-6 py-10 text-center">
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {orders.map((order) => {
        const sought = order.coverageSought ?? 0;
        const filled = order.coverageFilled ?? 0;
        const remaining = Math.max(0, sought - filled);
        const pctFilled = sought > 0 ? (filled / sought) * 100 : 0;

        const maxCoverage = order.coverageSought ?? order.coverageUsd;
        const loops = order.numLoops || settings.LoopDefaultLoops;

        const currentCoverage = Math.max(filled, COMMUNITY_MIN_USD);
        const currentTier = matchTier(tiers, currentCoverage);
        const currentAPY = currentTier?.APY ?? 0;
        const currentLoanAPR = currentTier?.LoopLoanAPR ?? settings.LoopLoanAPR;
        const currentSettings = { ...settings, LoopRewardAPY: currentAPY, LoopLoanAPR: currentLoanAPR };
        const currentProj = calcProjections(currentCoverage, loops, currentSettings);

        const maxTier = matchTier(tiers, maxCoverage);
        const maxAPY = maxTier?.APY ?? 0;
        const maxLoanAPR = maxTier?.LoopLoanAPR ?? settings.LoopLoanAPR;
        const maxSettings = { ...settings, LoopRewardAPY: maxAPY, LoopLoanAPR: maxLoanAPR };
        const maxProj = calcProjections(maxCoverage, loops, maxSettings);

        return (
          <div key={order.id} className="rounded-lg border border-border p-5 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Community Pool</span>
              <span className="text-xs text-muted-foreground">{order.contractDuration}-day contracts</span>
            </div>

            {/* Progress bar */}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-muted-foreground">Coverage Filled</span>
                <span className="font-medium">{usd(filled)} / {usd(sought)}</span>
              </div>
              <div className="h-2.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                <div
                  className="h-full rounded-full bg-blue-500 transition-all duration-300"
                  style={{ width: `${Math.min(100, pctFilled)}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {usd(remaining)} remaining &nbsp;·&nbsp; {pctFilled.toFixed(1)}% filled
              </p>
            </div>

            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Minimum</span>
                <span className="font-medium">${COMMUNITY_MIN_USD.toLocaleString("en-US")} SSTM</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Contract</span>
                <span className="font-medium">{order.contractDuration} days</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Current APY</span>
                <span className="font-medium text-green-600 dark:text-green-400">{currentProj ? pct(currentProj.effectiveAPY) : "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Max APY</span>
                <span className="font-medium text-green-600 dark:text-green-400">{maxProj ? pct(maxProj.effectiveAPY) : "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Order Expires</span>
                <span className="font-medium">{displayExpiration(order)}</span>
              </div>
            </div>

            <button
              disabled={!connected || remaining <= 0}
              className="w-full rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-40"
              title={!connected ? "Connect wallet to participate" : remaining <= 0 ? "Pool is full" : "Join this community pool"}
              onClick={() => onMatch(order)}
            >
              {remaining <= 0 ? "Pool Full" : "Join Pool"}
            </button>
          </div>
        );
      })}
    </div>
  );
}

function P2POrderColumn({
  orders, myWallet, connected, settings, tiers, onMatch, emptyMessage,
}: {
  orders: OpenLoopOrder[];
  myWallet: string;
  connected: boolean;
  settings: LoopSettings;
  tiers: Tier[];
  onMatch: (o: OpenLoopOrder) => void;
  emptyMessage: string;
}) {
  if (orders.length === 0) {
    return (
      <div className="rounded-lg border border-border px-6 py-10 text-center">
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-200 dark:bg-gray-800 text-left">
            <th className="px-3 py-2 font-medium">Counterparty</th>
            <th className="px-3 py-2 font-medium">Coverage</th>
            <th className="px-3 py-2 font-medium">Loops</th>
            <th className="px-3 py-2 font-medium">Contract</th>
            <th className="px-3 py-2 font-medium">Current APY</th>
            <th className="px-3 py-2 font-medium">Max APY</th>
            <th className="px-3 py-2 font-medium">Expires</th>
            <th className="px-3 py-2 font-medium" />
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {orders.map((order) => {
            const isOwn = order.walletAddress === myWallet;
            const tier = matchTier(tiers, order.coverageUsd);
            const baseAPY = tier?.APY ?? 0;
            const loanAPR = tier?.LoopLoanAPR ?? settings.LoopLoanAPR;
            const tierSettings = { ...settings, LoopRewardAPY: baseAPY, LoopLoanAPR: loanAPR };
            const proj = calcProjections(order.coverageUsd, order.numLoops, tierSettings);
            return (
              <tr key={order.id} className={cn("hover:bg-accent/30 transition-colors", isOwn && "opacity-50")}>
                <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">
                  {shortWallet(order.walletAddress)}
                  {isOwn && <span className="ml-1 text-primary">(you)</span>}
                </td>
                <td className="px-3 py-2.5 text-xs">{usd(order.coverageUsd)}</td>
                <td className="px-3 py-2.5 text-xs">{order.numLoops}</td>
                <td className="px-3 py-2.5 text-xs">{order.contractDuration}d</td>
                <td className="px-3 py-2.5 text-xs text-green-600 dark:text-green-400 font-medium">
                  {pct(baseAPY)}
                </td>
                <td className="px-3 py-2.5 text-xs text-green-600 dark:text-green-400 font-medium">
                  {proj ? pct(proj.effectiveAPY) : "—"}
                </td>
                <td className="px-3 py-2.5 text-xs text-muted-foreground">
                  {displayExpiration(order)}
                </td>
                <td className="px-3 py-2.5 text-right">
                  <button
                    disabled={isOwn || !connected}
                    className="rounded-md bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-40"
                    title={isOwn ? "This is your order" : !connected ? "Connect wallet to match" : "Match this order"}
                    onClick={() => onMatch(order)}
                  >
                    Match
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function OpenOrdersTable({ orders, settings, tiers }: { orders: OpenLoopOrder[]; settings: LoopSettings; tiers: Tier[] }) {
  const { connected, publicKey } = useWallet();
  const router = useRouter();
  const myWallet = publicKey?.toBase58() ?? "";

  const communityOrders = orders.filter((o) => o.isCommunityOrder);
  const p2pOrders = orders.filter((o) => !o.isCommunityOrder);

  function openDetail(order: OpenLoopOrder) {
    router.push(`/yieldboost/${order.id}`);
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

      {/* ── Community Orders (left) ─────────────────────────────────────── */}
      <div className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold">Community Orders</h3>
          <p className="text-xs text-muted-foreground">
            Pool-based delta neutral &nbsp;·&nbsp; ${COMMUNITY_MIN_USD.toLocaleString("en-US")} SSTM minimum
          </p>
        </div>
        <CommunityOrderColumn
          orders={communityOrders}
          connected={connected}
          settings={settings}
          tiers={tiers}
          onMatch={openDetail}
          emptyMessage="No community orders currently available."
        />
      </div>

      {/* ── Peer-to-Peer Orders (right) ─────────────────────────────────── */}
      <div className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold">Peer-to-Peer Orders</h3>
          <p className="text-xs text-muted-foreground">
            Direct matching, higher tiers &nbsp;·&nbsp; ${P2P_MIN_USD.toLocaleString("en-US")} SSTM minimum
          </p>
        </div>
        <P2POrderColumn
          orders={p2pOrders}
          myWallet={myWallet}
          connected={connected}
          settings={settings}
          tiers={tiers}
          onMatch={openDetail}
          emptyMessage="No peer-to-peer orders yet. Be the first — place an order and your counterparty will find you here."
        />
      </div>
    </div>
  );
}

// ── Small helper components ───────────────────────────────────────────────────

function SummaryRow({
  label, value, sub, valueClass, bold, small,
}: {
  label: string; value: string; sub?: string; valueClass?: string; bold?: boolean; small?: boolean;
}) {
  return (
    <div className={cn("flex justify-between gap-2", small ? "text-sm" : "text-sm")}>
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className={cn("text-right", bold && "font-semibold", valueClass)}>
        {value}
        {sub && <span className="text-muted-foreground ml-1 font-normal">({sub})</span>}
      </span>
    </div>
  );
}

function TermRow({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}
