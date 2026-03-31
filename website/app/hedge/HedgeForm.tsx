"use client";

import { useState } from "react";
import { useAnchorWallet, useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { Program, AnchorProvider, BN } from "@coral-xyz/anchor";
import { cn } from "@/lib/utils";
import {
  PAYOUT_CONDITIONS,
  DST_CONDITIONS,
  KP_CONDITIONS,
  MINT_ADDRESSES,
  TOKEN_DECIMALS,
  PROGRAM_ID,
  INDEX_NAME_TO_ANCHOR,
  CONTRACT_DURATIONS,
} from "@/lib/orderConstants";
import { createHedgeOrder } from "@/app/_actions/createHedgeOrder";
import type { Tier } from "@/app/_actions/getTiers";
import type { TokenPrices } from "@/app/_actions/prices";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const IDL = require("@/lib/idl/condition_cover.json");

interface HedgeFormProps {
  tiers: Tier[];
  prices: TokenPrices;
}

function formatDate(date: Date): string {
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const d = date.getDate().toString().padStart(2, "0");
  return `${d} ${months[date.getMonth()]} ${date.getFullYear()} 11:59 PM`;
}

export function HedgeForm({ tiers, prices }: HedgeFormProps) {
  // ── Section 1 state ─────────────────────────────────────────────────────────
  const [orderTiming, setOrderTiming] = useState<"Market" | "Committed" | "">("");
  const [orderDuration, setOrderDuration] = useState<string>("");
  const [currency, setCurrency] = useState<"USDC" | "SSTM" | "">("");
  const [indexName, setIndexName] = useState<"Dst" | "Kp" | "">("");
  const [conditionKey, setConditionKey] = useState<string>("");
  const [contractDuration, setContractDuration] = useState<string>("");
  const [coverage, setCoverage] = useState<string>("");

  // ── Section 2 state ─────────────────────────────────────────────────────────
  const [adjEnabled, setAdjEnabled] = useState(false);
  const [adj, setAdj] = useState(1.0);

  // ── UI state ─────────────────────────────────────────────────────────────────
  const [showDetails, setShowDetails] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, boolean>>({});
  const [result, setResult] = useState<{ ok: boolean; sig?: string; error?: string } | null>(null);

  const anchorWallet = useAnchorWallet();
  const { connection } = useConnection();
  const { connected, publicKey } = useWallet();

  // ── Derived calculations ─────────────────────────────────────────────────────
  const coverageNum = Math.max(0, parseInt(coverage, 10) || 0);
  const durationNum = parseInt(contractDuration, 10) || 0;
  const condition = PAYOUT_CONDITIONS[conditionKey];
  const annualOdds = condition?.indexLevelOdds ?? 0;
  const payoutProb = durationNum > 0 ? annualOdds * (durationNum / 365) : 0;

  const tokenPrice = currency === "USDC" ? prices.USDC : currency === "SSTM" ? prices.SSTM : 0;
  const coverageTokens = tokenPrice > 0 ? coverageNum / tokenPrice : 0;
  const basePremium = coverageTokens * payoutProb;
  const multiplier = adjEnabled ? adj : 1.0;
  const adjustedPremium = basePremium * multiplier;

  const matchedTier = tiers.find(
    (t) => coverageNum >= t.TotalStart && (t.TotalLessThan === null || coverageNum < t.TotalLessThan)
  );
  const feeRate = currency === "USDC" ? (matchedTier?.USDCserviceFee ?? 0) : (matchedTier?.SSTMserviceFee ?? 0);
  const serviceFee = adjustedPremium * feeRate;

  const layer1Usd = orderTiming === "Committed" ? 0.15 : 0.10;
  const layer1Sol = prices.SOL > 0 ? layer1Usd / prices.SOL : 0;
  const layer1Token = tokenPrice > 0 ? layer1Usd / tokenPrice : 0;
  const totalCost = adjustedPremium + serviceFee + layer1Token;

  const availableConditions = indexName === "Dst" ? DST_CONDITIONS : indexName === "Kp" ? KP_CONDITIONS : [];

  const orderExpiresAt =
    orderTiming === "Committed" && orderDuration
      ? new Date(Date.now() + parseInt(orderDuration, 10) * 86_400_000)
      : null;

  // ── Validation ───────────────────────────────────────────────────────────────
  function validate(): Record<string, boolean> {
    const e: Record<string, boolean> = {};
    if (!orderTiming) e.orderTiming = true;
    if (orderTiming === "Committed" && !orderDuration) e.orderDuration = true;
    if (!currency) e.currency = true;
    if (!indexName) e.indexName = true;
    if (!conditionKey) e.condition = true;
    if (!contractDuration) e.contractDuration = true;
    if (!coverage || coverageNum <= 0) e.coverage = true;
    if (!acknowledged) e.acknowledged = true;
    return e;
  }

  const isValid = Object.keys(validate()).length === 0;

  // ── Submit handlers ──────────────────────────────────────────────────────────
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
      if (!anchorWallet || !publicKey) throw new Error("Wallet not connected");
      if (!condition) throw new Error("No payout condition selected");

      const nonce = new BN(Date.now());
      const nonceBuf = nonce.toArrayLike(Buffer, "le", 8);

      const mintAddress = new PublicKey(
        currency === "USDC" ? MINT_ADDRESSES.USDC : MINT_ADDRESSES.SSTM
      );
      const programPubkey = new PublicKey(PROGRAM_ID);

      const [orderPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("order"), publicKey.toBuffer(), nonceBuf],
        programPubkey
      );
      const [escrowPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("escrow"), orderPda.toBuffer()],
        programPubkey
      );

      const ownerTokenAccount = getAssociatedTokenAddressSync(mintAddress, publicKey);
      const premiumUnits = Math.round(adjustedPremium * 10 ** TOKEN_DECIMALS);
      const coverageUnits = Math.round(coverageTokens * 10 ** TOKEN_DECIMALS);

      // For Market orders: expiration far in the future (year 2099)
      const expirationUnix = orderExpiresAt
        ? Math.floor(orderExpiresAt.getTime() / 1000)
        : Math.floor(new Date("2099-12-31").getTime() / 1000);

      const provider = new AnchorProvider(connection, anchorWallet, { commitment: "confirmed" });
      const program = new Program(IDL, provider);

      const sig = await (program.methods as any)
        .createOrder(
          nonce,
          { hedge: {} },
          INDEX_NAME_TO_ANCHOR[condition.indexName as "Dst" | "Kp"],
          new BN(condition.indexLevelEncoded),
          new BN(coverageUnits),
          new BN(premiumUnits),
          new BN(expirationUnix),
          currency === "USDC" ? { usdc: {} } : { sstm: {} }
        )
        .accounts({
          order: orderPda,
          escrow: escrowPda,
          ownerTokenAccount,
          mint: mintAddress,
          owner: publicKey,
          tokenProgram: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      // Write to MySQL
      await createHedgeOrder({
        orderTiming: orderTiming as "Market" | "Committed",
        orderDuration: orderTiming === "Committed" ? parseInt(orderDuration, 10) : null,
        expirationDate: orderExpiresAt?.toISOString() ?? null,
        formattedExpiration: orderExpiresAt ? formatDate(orderExpiresAt) : null,
        currency: currency as "USDC" | "SSTM",
        contractDuration: durationNum,
        indexName: condition.indexName === "Dst" ? "Disturbance Storm Time" : "Planetary K-Index",
        indexLevel: condition.indexLevel,
        indexUnit: condition.indexUnit,
        payoutProbability: payoutProb,
        coverage: coverageNum,
        hedgePremium: basePremium,
        hedgePremiumAdjustment: multiplier,
        adjustedHedgePremium: adjustedPremium,
        serviceFee,
        totalServiceFees: serviceFee + layer1Token,
        gasFeeLayer1: layer1Sol,
        walletAddress: publicKey.toBase58(),
        orderAddress: orderPda.toBase58(),
        denominationAddress: mintAddress.toBase58(),
      });

      setResult({ ok: true, sig });
      // Reset form
      setOrderTiming(""); setOrderDuration(""); setCurrency(""); setIndexName("");
      setConditionKey(""); setContractDuration(""); setCoverage("");
      setAdjEnabled(false); setAdj(1.0); setAcknowledged(false);
      setFieldErrors({});
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setResult({ ok: false, error: msg });
    } finally {
      setSubmitting(false);
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-[5fr_3fr] gap-6">

        {/* ── Left panel ─────────────────────────────────────────────────────── */}
        <div className="space-y-6">

          {/* Section 1: Order Parameters */}
          <section className="rounded-lg border border-border p-6 space-y-5">
            <h2 className="text-lg font-semibold">Order Parameters</h2>

            {/* Order Timing */}
            <div>
              <label className="block text-sm font-medium mb-2">Order Timing</label>
              <div className="flex flex-wrap gap-3">
                {(["Market", "Committed"] as const).map((t) => (
                  <label
                    key={t}
                    className={cn(
                      "flex items-center gap-2 cursor-pointer rounded-md border px-4 py-2 text-sm transition-colors",
                      orderTiming === t ? "border-primary bg-primary/5" : "border-border hover:border-primary/50",
                      fieldErrors.orderTiming && "ring-2 ring-red-500"
                    )}
                  >
                    <input
                      type="radio"
                      name="orderTiming"
                      value={t}
                      checked={orderTiming === t}
                      onChange={() => { setOrderTiming(t); setFieldErrors((e) => ({ ...e, orderTiming: false })); }}
                      className="accent-primary"
                    />
                    {t === "Market" ? "Real-Time Market" : "Committed"}
                  </label>
                ))}
              </div>
              {orderTiming === "Market" && (
                <p className="text-xs text-muted-foreground mt-1.5">Order waits on-chain until matched. No expiration.</p>
              )}
              {orderTiming === "Committed" && (
                <p className="text-xs text-muted-foreground mt-1.5">Order expires if unmatched; escrow is returned.</p>
              )}
            </div>

            {/* Order Duration (Committed only) */}
            {orderTiming === "Committed" && (
              <div>
                <label className="block text-sm font-medium mb-2">Order Duration</label>
                <select
                  value={orderDuration}
                  onChange={(e) => setOrderDuration(e.target.value)}
                  className={cn(
                    "w-full rounded-md border border-border bg-background px-3 py-2 text-sm",
                    fieldErrors.orderDuration && "ring-2 ring-red-500"
                  )}
                >
                  <option value="">Select days…</option>
                  {Array.from({ length: 90 }, (_, i) => i + 1).map((d) => (
                    <option key={d} value={d}>{d} day{d > 1 ? "s" : ""}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Contract Currency */}
            <div>
              <label className="block text-sm font-medium mb-2">Contract Currency</label>
              <div className="flex flex-wrap gap-3">
                {(["USDC", "SSTM"] as const).map((c) => (
                  <label
                    key={c}
                    className={cn(
                      "flex items-center gap-2 cursor-pointer rounded-md border px-4 py-2 text-sm transition-colors",
                      currency === c ? "border-primary bg-primary/5" : "border-border hover:border-primary/50",
                      fieldErrors.currency && "ring-2 ring-red-500"
                    )}
                  >
                    <input
                      type="radio"
                      name="currency"
                      value={c}
                      checked={currency === c}
                      onChange={() => { setCurrency(c); setFieldErrors((e) => ({ ...e, currency: false })); }}
                      className="accent-primary"
                    />
                    {c}
                    <span className="text-muted-foreground text-xs">
                      ${c === "USDC" ? prices.USDC.toFixed(4) : prices.SSTM.toFixed(4)}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* Space Weather Index */}
            <div>
              <label className="block text-sm font-medium mb-2">Space Weather Index</label>
              <select
                value={indexName}
                onChange={(e) => {
                  setIndexName(e.target.value as "Dst" | "Kp" | "");
                  setConditionKey("");
                  setFieldErrors((er) => ({ ...er, indexName: false, condition: false }));
                }}
                className={cn(
                  "w-full rounded-md border border-border bg-background px-3 py-2 text-sm",
                  fieldErrors.indexName && "ring-2 ring-red-500"
                )}
              >
                <option value="">Select index…</option>
                <option value="Dst">Disturbance Storm Time (Dst)</option>
                <option value="Kp">Planetary K-Index (Kp)</option>
              </select>
            </div>

            {/* Payout Condition */}
            <div>
              <label className="block text-sm font-medium mb-2">Payout Condition</label>
              <select
                value={conditionKey}
                onChange={(e) => { setConditionKey(e.target.value); setFieldErrors((er) => ({ ...er, condition: false })); }}
                disabled={!indexName}
                className={cn(
                  "w-full rounded-md border border-border bg-background px-3 py-2 text-sm disabled:opacity-50",
                  fieldErrors.condition && "ring-2 ring-red-500"
                )}
              >
                <option value="">Select condition…</option>
                {availableConditions.map((c) => (
                  <option key={c.key} value={c.key}>{c.label}</option>
                ))}
              </select>
              {condition && (
                <p className="text-xs text-muted-foreground mt-1.5">
                  Annual payout odds: <span className="text-red-500 font-medium">{(annualOdds * 100).toFixed(4)}%</span>
                </p>
              )}
            </div>

            {/* Contract Duration */}
            <div>
              <label className="block text-sm font-medium mb-2">Contract Duration</label>
              <select
                value={contractDuration}
                onChange={(e) => { setContractDuration(e.target.value); setFieldErrors((er) => ({ ...er, contractDuration: false })); }}
                className={cn(
                  "w-full rounded-md border border-border bg-background px-3 py-2 text-sm",
                  fieldErrors.contractDuration && "ring-2 ring-red-500"
                )}
              >
                <option value="">Select duration…</option>
                {CONTRACT_DURATIONS.map((d) => (
                  <option key={d} value={d}>{d} day{d > 1 ? "s" : ""}</option>
                ))}
              </select>
            </div>

            {/* Coverage Sought */}
            <div>
              <label className="block text-sm font-medium mb-2">Coverage Sought</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm select-none">$</span>
                <input
                  type="number"
                  value={coverage}
                  onChange={(e) => { setCoverage(e.target.value); setFieldErrors((er) => ({ ...er, coverage: false })); }}
                  min={1}
                  max={10_000_000_000}
                  step={1}
                  placeholder="0"
                  className={cn(
                    "w-full rounded-md border border-border bg-background pl-7 pr-3 py-2 text-sm",
                    fieldErrors.coverage && "ring-2 ring-red-500"
                  )}
                />
              </div>
              {matchedTier && coverageNum > 0 && (
                <p className="text-xs text-muted-foreground mt-1.5">
                  Coverage tier: <span className="font-medium">{matchedTier.Name}</span>
                  {" · "}Service fee rate:{" "}
                  <span className="font-medium">
                    {((currency === "USDC" ? matchedTier.USDCserviceFee : matchedTier.SSTMserviceFee) * 100).toFixed(2)}%
                  </span>
                </p>
              )}
            </div>
          </section>

          {/* Section 2: Optional Features */}
          <section className="rounded-lg border border-border p-6 space-y-4">
            <h2 className="text-lg font-semibold">Optional Features</h2>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setAdjEnabled((v) => !v)}
                className={cn(
                  "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors",
                  adjEnabled ? "bg-primary" : "bg-muted"
                )}
                aria-pressed={adjEnabled}
              >
                <span
                  className={cn(
                    "inline-block h-4 w-4 rounded-full bg-white shadow transition-transform",
                    adjEnabled ? "translate-x-6" : "translate-x-1"
                  )}
                />
              </button>
              <span className="text-sm font-medium">Hedge Premium Adjustment</span>

              {/* Help tooltip */}
              <div className="relative group">
                <button
                  type="button"
                  className="flex h-5 w-5 items-center justify-center rounded-full border border-muted-foreground text-muted-foreground text-xs"
                >
                  ?
                </button>
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-72 rounded-md bg-foreground px-3 py-2 text-xs text-background shadow-lg opacity-0 group-hover:opacity-100 pointer-events-none z-10">
                  Multiply your offered premium relative to the base actuarial rate. A higher multiplier
                  makes your order more attractive to Cover parties; lower reduces your cost but may take
                  longer to match.
                  <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-foreground" />
                </div>
              </div>
            </div>

            {adjEnabled && (
              <div className="space-y-2 pl-14">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Multiplier</span>
                  <span className="font-medium tabular-nums">{adj.toFixed(2)}×</span>
                </div>
                <input
                  type="range"
                  min={0.05}
                  max={5.0}
                  step={0.05}
                  value={adj}
                  onChange={(e) => setAdj(parseFloat(e.target.value))}
                  className="w-full accent-primary"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>0.05×</span>
                  <span>1.0×</span>
                  <span>5.0×</span>
                </div>
              </div>
            )}
          </section>
        </div>

        {/* ── Right panel: Order Summary ──────────────────────────────────────── */}
        <div>
          <div className="rounded-lg border border-border p-6 space-y-4 sticky top-24">
            <h2 className="text-lg font-semibold">Order Summary</h2>

            {/* Always-visible rows */}
            <div className="space-y-2 text-sm">
              <SummaryRow label="Coverage Sought" value={coverageNum > 0 ? `$${coverageNum.toLocaleString()}` : "—"} />
              <SummaryRow
                label="Premium to Pay"
                value={
                  adjustedPremium > 0 && currency
                    ? `${adjustedPremium.toFixed(4)} ${currency}`
                    : "—"
                }
                sub={
                  adjustedPremium > 0 && tokenPrice > 0
                    ? `$${(adjustedPremium * tokenPrice).toFixed(2)}`
                    : undefined
                }
              />
              <SummaryRow label="Contract Duration" value={durationNum > 0 ? `${durationNum} days` : "—"} />
              <SummaryRow label="Payout Trigger" value={condition?.label ?? "—"} />
              <SummaryRow
                label="Probability of Payout"
                value={payoutProb > 0 ? `${(payoutProb * 100).toFixed(2)}%` : "—"}
                valueClass="text-red-500 font-medium"
              />
            </div>

            {/* Expandable detail */}
            <button
              type="button"
              onClick={() => setShowDetails((v) => !v)}
              className="text-xs text-primary underline underline-offset-2"
            >
              {showDetails ? "Hide calculation details" : "Show calculation details"}
            </button>

            {showDetails && (
              <div className="space-y-1.5 text-xs border-t border-border pt-3">
                <SummaryRow
                  label="Annual Payout Odds"
                  value={annualOdds > 0 ? `${(annualOdds * 100).toFixed(4)}%` : "—"}
                  valueClass="text-red-500"
                  small
                />
                <SummaryRow
                  label="Base Hedge Premium"
                  value={basePremium > 0 ? `${basePremium.toFixed(4)} ${currency}` : "—"}
                  small
                />
                {adjEnabled && (
                  <SummaryRow label="Premium Adjustment" value={`× ${adj.toFixed(2)}`} small />
                )}
                <SummaryRow
                  label="Adjusted Premium"
                  value={adjustedPremium > 0 ? `${adjustedPremium.toFixed(4)} ${currency}` : "—"}
                  small
                />
                <SummaryRow
                  label="Service Fee"
                  value={serviceFee > 0 ? `${serviceFee.toFixed(4)} ${currency}` : "—"}
                  small
                />
                <SummaryRow
                  label="Layer 1 Gas"
                  value={layer1Sol > 0 ? `${layer1Sol.toFixed(6)} SOL` : "—"}
                  small
                />
                <div className="border-t border-border pt-1.5">
                  <SummaryRow
                    label="Total Cost"
                    value={totalCost > 0 ? `${totalCost.toFixed(4)} ${currency}` : "—"}
                    bold
                    small
                  />
                </div>
                {orderTiming === "Committed" && orderExpiresAt && (
                  <SummaryRow label="Order Expiration" value={formatDate(orderExpiresAt)} small />
                )}
              </div>
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
                  I understand that this order will lock funds in a Solana smart contract escrow and
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
                {submitting ? "Submitting…" : "Place Hedge Order"}
              </button>
            </div>

            {/* Result banner */}
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
                  <>
                    <p className="font-semibold">Order placed successfully!</p>
                    {result.sig && (
                      <a
                        href={`https://explorer.solana.com/tx/${result.sig}?cluster=devnet`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline mt-1 block"
                      >
                        View on Solana Explorer →
                      </a>
                    )}
                  </>
                ) : (
                  <>
                    <p className="font-semibold">Transaction failed</p>
                    <p className="mt-0.5 break-all">{result.error}</p>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Confirmation modal ────────────────────────────────────────────────── */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-sm rounded-xl bg-background border border-border p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-semibold">Confirm Hedge Order</h3>
            <p className="text-xs text-muted-foreground">
              Your premium will be locked in a Solana smart contract escrow. Review the terms below
              before confirming.
            </p>
            <div className="space-y-2 text-sm">
              <SummaryRow label="Coverage" value={`$${coverageNum.toLocaleString()}`} />
              <SummaryRow label="Premium" value={`${adjustedPremium.toFixed(4)} ${currency}`} />
              <SummaryRow label="Trigger" value={condition?.label ?? "—"} />
              <SummaryRow label="Duration" value={`${durationNum} days`} />
              <SummaryRow label="Payout Probability" value={`${(payoutProb * 100).toFixed(2)}%`} valueClass="text-red-500" />
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

// ── Small helper component for consistent summary rows ───────────────────────
function SummaryRow({
  label,
  value,
  sub,
  valueClass,
  bold,
  small,
}: {
  label: string;
  value: string;
  sub?: string;
  valueClass?: string;
  bold?: boolean;
  small?: boolean;
}) {
  return (
    <div className={cn("flex justify-between gap-2", small ? "text-xs" : "text-sm")}>
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className={cn("text-right", bold && "font-semibold", valueClass)}>
        {value}
        {sub && <span className="text-muted-foreground ml-1 font-normal">({sub})</span>}
      </span>
    </div>
  );
}
