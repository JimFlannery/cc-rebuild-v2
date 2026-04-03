"use client";

import { useState } from "react";
import { useAnchorWallet, useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { Program, AnchorProvider, BN } from "@coral-xyz/anchor";
import { cn } from "@/lib/utils";
import { CONTRACT_DURATIONS, matchTier, MINT_ADDRESSES, TOKEN_DECIMALS, PROGRAM_ID } from "@/lib/orderConstants";
import { createLoopOrder } from "@/app/_actions/createLoopOrder";
import { matchLoopOrder } from "@/app/_actions/matchLoopOrder";
import { Tooltip } from "@/components/tooltip";
import type { LoopSettings } from "@/app/_actions/getLoopSettings";
import type { TokenPrices } from "@/app/_actions/prices";
import type { OpenLoopOrder } from "@/app/_actions/getOpenLoopOrders";
import type { Tier } from "@/app/_actions/getTiers";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const IDL = require("@/lib/idl/condition_cover.json");

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

function shortWallet(address: string): string {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
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
  const [tab, setTab] = useState<"create" | "open">("create");

  return (
    <div className="space-y-6">
      {/* Tab bar */}
      <div className="flex gap-1 border-b border-border">
        {(["create", "open"] as const).map((t) => (
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
            {t === "create" ? "Place Order" : `Open Orders${openOrders.length > 0 ? ` (${openOrders.length})` : ""}`}
          </button>
        ))}
      </div>

      {tab === "create" && (
        <CreateOrderForm settings={settings} prices={prices} tiers={tiers} />
      )}
      {tab === "open" && (
        <OpenOrdersTable orders={openOrders} settings={settings} />
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
  const effectiveSettings = { ...settings, LoopRewardAPY: rewardAPY };
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
    if (coverageNum <= 0) e.coverage = true;
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
              <TermRow label="Loan APR" value={pct(settings.LoopLoanAPR)} sub="from treasury" />
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
                      sub={`vs ${pct(settings.LoopRewardAPY)} base`}
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
                      <SummaryRow label="Your Initial Cover" value={usd(coverageNum)} small />
                      <SummaryRow label="Treasury Loans Issued" value={usd(proj.totalLoansUsd)} small />
                      <SummaryRow label="Gross Annual Rewards" value={usd(proj.grossAnnualRewardsUsd)} small />
                      <SummaryRow label="Annual Interest" value={`−${usd(proj.annualInterestUsd)}`} small />
                      <SummaryRow label="Platform Fee (upfront)" value={`−${usd(proj.upfrontFeeUsd)}`} sub="USDC" small />
                      <div className="border-t border-border pt-1.5">
                        <SummaryRow label="Net Annual Income" value={usd(proj.netAnnualIncomeUsd)} bold small />
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

function OpenOrdersTable({ orders, settings }: { orders: OpenLoopOrder[]; settings: LoopSettings }) {
  const { connected, publicKey } = useWallet();
  const anchorWallet = useAnchorWallet();
  const { connection } = useConnection();
  const myWallet = publicKey?.toBase58() ?? "";

  const [matchTarget, setMatchTarget] = useState<OpenLoopOrder | null>(null);
  const [matching, setMatching] = useState(false);
  const [matchResult, setMatchResult] = useState<{ ok: boolean; error?: string } | null>(null);

  async function handleConfirmMatch(order: OpenLoopOrder) {
    setMatching(true);
    setMatchResult(null);
    try {
      if (!anchorWallet || !publicKey) throw new Error("Wallet not connected");

      const proj = calcProjections(order.coverageUsd, order.numLoops, settings);
      if (!proj) throw new Error("Could not calculate projections");

      const sstmMint = new PublicKey(MINT_ADDRESSES.SSTM);
      const programPubkey = new PublicKey(PROGRAM_ID);
      const provider = new AnchorProvider(connection, anchorWallet, { commitment: "confirmed" });
      const program = new Program(IDL, provider);

      const user1Pubkey = new PublicKey(order.walletAddress);
      const user2Pubkey = publicKey;
      const loopNonce = new BN(Date.now());
      const nonceBuf = loopNonce.toArrayLike(Buffer, "le", 8);

      // ── Derive seed order PDAs (user1's pre-existing orders) ──────────────
      // User1 created their cover order with nonce embedded in their DB record.
      // For now we re-derive from the stored OrderAddress. In production the
      // frontend fetches the four order PDAs from the DB before calling this.
      // TODO: fetch user1's four seed order PDAs from the Orders table via API
      // and pass them in, rather than re-deriving here.
      const [user1CoverOrder] = PublicKey.findProgramAddressSync(
        [Buffer.from("order"), user1Pubkey.toBuffer(), nonceBuf],
        programPubkey
      );
      const [user1HedgeOrder] = PublicKey.findProgramAddressSync(
        [Buffer.from("order"), user1Pubkey.toBuffer(), new BN(loopNonce.toNumber() + 1).toArrayLike(Buffer, "le", 8)],
        programPubkey
      );

      // ── User2 (matcher) creates their two seed orders ─────────────────────
      const user2HedgeNonce = new BN(Date.now() + 2);
      const user2CoverNonce = new BN(Date.now() + 3);

      const [user2HedgeOrder] = PublicKey.findProgramAddressSync(
        [Buffer.from("order"), user2Pubkey.toBuffer(), user2HedgeNonce.toArrayLike(Buffer, "le", 8)],
        programPubkey
      );
      const [user2HedgeEscrow] = PublicKey.findProgramAddressSync(
        [Buffer.from("escrow"), user2HedgeOrder.toBuffer()],
        programPubkey
      );
      const [user2CoverOrder] = PublicKey.findProgramAddressSync(
        [Buffer.from("order"), user2Pubkey.toBuffer(), user2CoverNonce.toArrayLike(Buffer, "le", 8)],
        programPubkey
      );
      const [user2CoverEscrow] = PublicKey.findProgramAddressSync(
        [Buffer.from("escrow"), user2CoverOrder.toBuffer()],
        programPubkey
      );

      const user2TokenAccount = getAssociatedTokenAddressSync(sstmMint, user2Pubkey);
      const coverageUnits = new BN(Math.round(order.coverageUsd * 10 ** TOKEN_DECIMALS));
      // Hedge premium = coverage × payout_probability (Dst -850 = 1.2%)
      const premiumUnits = new BN(Math.round(order.coverageUsd * 0.012 * 10 ** TOKEN_DECIMALS));
      const expirationUnix = new BN(Math.floor(Date.now() / 1000) + order.contractDuration * 86400);
      const DST_LEVEL = new BN(-85000); // -850 nT × 100

      // Create user2 Hedge order (matches user1 Cover)
      await (program.methods as any)
        .createOrder(user2HedgeNonce, { hedge: {} }, { dst: {} }, DST_LEVEL,
          coverageUnits, premiumUnits, expirationUnix, { sstm: {} })
        .accounts({
          order: user2HedgeOrder, escrow: user2HedgeEscrow,
          ownerTokenAccount: user2TokenAccount, mint: sstmMint,
          owner: user2Pubkey, tokenProgram: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
          systemProgram: SystemProgram.programId,
        }).rpc();

      // Create user2 Cover order (matches user1 Hedge)
      await (program.methods as any)
        .createOrder(user2CoverNonce, { cover: {} }, { dst: {} }, DST_LEVEL,
          coverageUnits, premiumUnits, expirationUnix, { sstm: {} })
        .accounts({
          order: user2CoverOrder, escrow: user2CoverEscrow,
          ownerTokenAccount: user2TokenAccount, mint: sstmMint,
          owner: user2Pubkey, tokenProgram: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
          systemProgram: SystemProgram.programId,
        }).rpc();

      // ── Create LoopSet PDA ────────────────────────────────────────────────
      const [loopSetPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("loop_set"), user1Pubkey.toBuffer(), user2Pubkey.toBuffer(), nonceBuf],
        programPubkey
      );
      const rewardApyBps = Math.round(settings.LoopRewardAPY * 10_000);
      const loanAprBps  = Math.round(settings.LoopLoanAPR   * 10_000);
      const ltvBps      = Math.round(settings.LoopLTV        * 10_000);
      const feeBps      = Math.round(settings.LoopFeePct     * 10_000);

      await (program.methods as any)
        .createLoopSet(loopNonce, order.numLoops,
          rewardApyBps, loanAprBps, ltvBps, feeBps, expirationUnix)
        .accounts({
          loopSet: loopSetPda,
          user1CoverOrder, user1HedgeOrder, user2HedgeOrder, user2CoverOrder,
          creator: user2Pubkey, systemProgram: SystemProgram.programId,
        }).rpc();

      // ── Match the A-pair (user1 Cover ↔ user2 Hedge) ─────────────────────
      const [user1CoverEscrow] = PublicKey.findProgramAddressSync(
        [Buffer.from("escrow"), user1CoverOrder.toBuffer()], programPubkey
      );
      const [user1HedgeEscrow] = PublicKey.findProgramAddressSync(
        [Buffer.from("escrow"), user1HedgeOrder.toBuffer()], programPubkey
      );
      const user1TokenAccount = getAssociatedTokenAddressSync(sstmMint, user1Pubkey);

      // A-contract: hedge = user2HedgeOrder, cover = user1CoverOrder
      const [contractA] = PublicKey.findProgramAddressSync(
        [Buffer.from("contract"), user2HedgeOrder.toBuffer(), user1CoverOrder.toBuffer()],
        programPubkey
      );
      const [contractAEscrow] = PublicKey.findProgramAddressSync(
        [Buffer.from("contract_escrow"), contractA.toBuffer()], programPubkey
      );
      await (program.methods as any).matchOrder()
        .accounts({
          contract: contractA, contractEscrow: contractAEscrow,
          hedgeOrder: user2HedgeOrder, coverOrder: user1CoverOrder,
          hedgeEscrow: user2HedgeEscrow, coverEscrow: user1CoverEscrow,
          coverOwnerTokenAccount: user1TokenAccount,
          hedgeOwnerTokenAccount: user2TokenAccount,
          mint: sstmMint, matcher: user2Pubkey,
          tokenProgram: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
          systemProgram: SystemProgram.programId,
        }).rpc();

      // B-contract: hedge = user1HedgeOrder, cover = user2CoverOrder
      const [contractB] = PublicKey.findProgramAddressSync(
        [Buffer.from("contract"), user1HedgeOrder.toBuffer(), user2CoverOrder.toBuffer()],
        programPubkey
      );
      const [contractBEscrow] = PublicKey.findProgramAddressSync(
        [Buffer.from("contract_escrow"), contractB.toBuffer()], programPubkey
      );
      await (program.methods as any).matchOrder()
        .accounts({
          contract: contractB, contractEscrow: contractBEscrow,
          hedgeOrder: user1HedgeOrder, coverOrder: user2CoverOrder,
          hedgeEscrow: user1HedgeEscrow, coverEscrow: user2CoverEscrow,
          coverOwnerTokenAccount: user2TokenAccount,
          hedgeOwnerTokenAccount: user1TokenAccount,
          mint: sstmMint, matcher: user2Pubkey,
          tokenProgram: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
          systemProgram: SystemProgram.programId,
        }).rpc();

      // ── Register both initial contracts into the LoopSet ──────────────────
      for (const contractPda of [contractA, contractB]) {
        await (program.methods as any).registerLoopContract()
          .accounts({
            loopSet: loopSetPda,
            contract: contractPda,
            caller: user2Pubkey,
          }).rpc();
      }

      // ── Write to MySQL ────────────────────────────────────────────────────
      await matchLoopOrder({
        seedOrderId: order.id,
        matcherWalletAddress: user2Pubkey.toBase58(),
        loopSetAddress: loopSetPda.toBase58(),
        contractAAddress: contractA.toBase58(),
        contractBAddress: contractB.toBase58(),
        numLoops: order.numLoops,
        coverageUsd: order.coverageUsd,
        contractDuration: order.contractDuration,
        effectiveAPY: proj.effectiveAPY,
        upfrontFeeUsd: proj.upfrontFeeUsd,
        totalCoverUsd: proj.totalCoverUsd,
        totalLoansUsd: proj.totalLoansUsd,
        totalInterestUsd: proj.annualInterestUsd * order.contractDuration / 365,
      });

      setMatchResult({ ok: true });
      setMatchTarget(null);
    } catch (err) {
      setMatchResult({ ok: false, error: err instanceof Error ? err.message : String(err) });
    } finally {
      setMatching(false);
    }
  }

  if (orders.length === 0) {
    return (
      <div className="rounded-lg border border-border px-8 py-12 text-center">
        <p className="text-sm text-muted-foreground">No open loop orders right now.</p>
        <p className="text-xs text-muted-foreground mt-1">Be the first — place an order and your counterparty will find you here.</p>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-200 dark:bg-gray-800 text-left">
              <th className="px-4 py-2.5 font-medium">Counterparty</th>
              <th className="px-4 py-2.5 font-medium">Coverage</th>
              <th className="px-4 py-2.5 font-medium">Loops</th>
              <th className="px-4 py-2.5 font-medium">Contract</th>
              <th className="px-4 py-2.5 font-medium">Effective APY</th>
              <th className="px-4 py-2.5 font-medium">Order Expires</th>
              <th className="px-4 py-2.5 font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {orders.map((order) => {
              const isOwn = order.walletAddress === myWallet;
              const proj = calcProjections(order.coverageUsd, order.numLoops, settings);
              return (
                <tr key={order.id} className={cn("hover:bg-accent/30 transition-colors", isOwn && "opacity-50")}>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                    {shortWallet(order.walletAddress)}
                    {isOwn && <span className="ml-1 text-primary">(you)</span>}
                  </td>
                  <td className="px-4 py-3">{usd(order.coverageUsd)}</td>
                  <td className="px-4 py-3">{order.numLoops}</td>
                  <td className="px-4 py-3">{order.contractDuration}d</td>
                  <td className="px-4 py-3 text-green-600 dark:text-green-400 font-medium">
                    {proj ? pct(proj.effectiveAPY) : "—"}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {order.formattedExpiration ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      disabled={isOwn || !connected}
                      className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-40"
                      title={isOwn ? "This is your order" : !connected ? "Connect wallet to match" : "Match this order"}
                      onClick={() => { setMatchTarget(order); setMatchResult(null); }}
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

      {/* Match result banner */}
      {matchResult && (
        <div className={cn(
          "rounded-md p-3 text-xs mt-4",
          matchResult.ok
            ? "bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-200"
            : "bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200"
        )}>
          {matchResult.ok
            ? "Loop set matched and deployed successfully! Initial contracts are now active."
            : <><span className="font-semibold">Match failed: </span>{matchResult.error}</>
          }
        </div>
      )}

      {/* Match confirmation modal */}
      {matchTarget && (() => {
        const proj = calcProjections(matchTarget.coverageUsd, matchTarget.numLoops, settings);
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
            <div className="w-full max-w-sm rounded-xl bg-background border border-border p-6 shadow-2xl space-y-4">
              <h3 className="text-base font-semibold">Confirm Match</h3>
              <p className="text-xs text-muted-foreground">
                You will create two seed orders and deploy the initial contract pair on-chain.
                Subsequent loan loops will be available to deploy from your Orders page.
              </p>
              <div className="space-y-2 text-sm">
                <SummaryRow label="Counterparty" value={shortWallet(matchTarget.walletAddress)} />
                <SummaryRow label="Coverage (each)" value={usd(matchTarget.coverageUsd)} />
                <SummaryRow label="Loops" value={String(matchTarget.numLoops)} />
                <SummaryRow label="Contract Duration" value={`${matchTarget.contractDuration} days`} />
                {proj && (
                  <>
                    <SummaryRow label="Leverage" value={`${proj.leverage.toFixed(2)}×`} />
                    <SummaryRow label="Effective APY" value={pct(proj.effectiveAPY)} valueClass="text-green-600 dark:text-green-400" />
                    <SummaryRow label="Upfront Fee" value={usd(proj.upfrontFeeUsd)} sub="USDC" />
                  </>
                )}
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => { setMatchTarget(null); setMatchResult(null); }}
                  disabled={matching}
                  className="flex-1 rounded-md border border-border px-4 py-2 text-sm hover:bg-accent transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleConfirmMatch(matchTarget)}
                  disabled={matching}
                  className="flex-1 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {matching ? "Deploying…" : "Confirm & Deploy"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </>
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
