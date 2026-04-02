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
import { Tooltip } from "@/components/tooltip";
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
  const h = date.getHours();
  const m = date.getMinutes().toString().padStart(2, "0");
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = (h % 12 || 12).toString().padStart(2, "0");
  return `${d} ${months[date.getMonth()]} ${date.getFullYear()} ${h12}:${m} ${ampm}`;
}

export function HedgeForm({ tiers, prices }: HedgeFormProps) {
  // ── Section 1 state ─────────────────────────────────────────────────────────
  const [orderDurationDays, setOrderDurationDays] = useState<string>("");
  const [orderDurationHours, setOrderDurationHours] = useState<string>("");
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

  const layer1Usd = 0.15;
  const layer1Sol = prices.SOL > 0 ? layer1Usd / prices.SOL : 0;
  const layer1Token = tokenPrice > 0 ? layer1Usd / tokenPrice : 0;
  const totalCost = adjustedPremium + serviceFee + layer1Token;

  const availableConditions = indexName === "Dst" ? DST_CONDITIONS : indexName === "Kp" ? KP_CONDITIONS : [];

  const orderDurationMs =
    (parseInt(orderDurationDays, 10) || 0) * 24 * 3_600_000 +
    (parseInt(orderDurationHours, 10) || 0) * 3_600_000;
  const orderExpiresAt = orderDurationMs > 0 ? new Date(Date.now() + orderDurationMs) : null;

  // ── Validation ───────────────────────────────────────────────────────────────
  function validate(): Record<string, boolean> {
    const e: Record<string, boolean> = {};
    if (!orderDurationDays && !orderDurationHours) e.orderDuration = true;
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
        orderTiming: "Committed",
        orderDuration: orderDurationDays ? parseInt(orderDurationDays, 10) : null,
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
      setOrderDurationDays(""); setOrderDurationHours(""); setCurrency(""); setIndexName("");
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
          <section className="rounded-lg border border-border space-y-2">
            <h2 className="w-full bg-gray-200 dark:bg-gray-800 pl-3 pr-2 py-1.5 font-medium rounded-t-lg">
              <span className="font-bold">1.&nbsp;&nbsp;</span>Select Required Order Parameters
            </h2>
            <div className="pb-0">

            {/* Order Duration */}
            <div className="px-6 pt-2 pb-3 flex items-center justify-between">
              <div>
                <label className="flex items-center gap-1.5 text-sm font-medium mb-2">
                  Order Duration
                  <Tooltip wide content={<>Committed orders allow you to set an expiration window which automatically cancels the order after the period you choose. The funds held in escrow are returned to your wallet upon cancellation.</>} />
                </label>
                <div className="flex gap-3">
                  <select
                    value={orderDurationDays}
                    onChange={(e) => { setOrderDurationDays(e.target.value); setFieldErrors((er) => ({ ...er, orderDuration: false })); }}
                    className={cn(
                      "w-full rounded-md border border-border bg-background px-3 py-2 text-sm",
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
                      "w-full rounded-md border border-border bg-background px-3 py-2 text-sm",
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

            <hr className="border-border mx-6" />

            {/* Contract Currency */}
            <div className="px-6 pt-2 pb-3">
              <label className="flex items-center gap-1.5 text-sm font-medium mb-2">
                Contract Currency
                <Tooltip wide content={<>Users must select which crypto currency token is to be used for both Hedge Premiums and Coverage for this risk transfer smart contract.<br /><br /><span className="font-semibold">Orders using USDC:</span> Standard contract service fee tiers.<br /><br /><span className="font-semibold">Orders using SSTM:</span> Discounted service fees by 25%. Cover parties earn SSTM token rewards based on coverage provided (up to 17% APY).</>} />
              </label>
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
                  </label>
                ))}
              </div>
            </div>

            <hr className="border-border mx-6" />

            {/* Space Weather Index */}
            <div className="px-6 pt-2 pb-3">
              <label className="flex items-center gap-1.5 text-sm font-medium mb-2">
                Space Weather Index
                <Tooltip wide content={<>Select the desired Space Weather Index to be used in this contract. Geomagnetic storms, which can negatively impact satellites, electrical grids, and any business operations reliant on both, are measured using the Dst and Kp indices.</>} />
              </label>
              <select
                value={indexName}
                onChange={(e) => {
                  setIndexName(e.target.value as "Dst" | "Kp" | "");
                  setConditionKey("");
                  setFieldErrors((er) => ({ ...er, indexName: false, condition: false }));
                }}
                className={cn(
                  "w-1/3 rounded-md border border-border bg-background px-3 py-2 text-sm",
                  fieldErrors.indexName && "ring-2 ring-red-500"
                )}
              >
                <option value="">Select index…</option>
                <option value="Dst">Disturbance Storm Time (Dst)</option>
                <option value="Kp">Planetary K-Index (Kp)</option>
              </select>
            </div>

            <hr className="border-border mx-6" />

            {/* Payout Condition */}
            <div className="px-6 pt-2 pb-3 flex items-center justify-between">
              <div>
                <label className="flex items-center gap-1.5 text-sm font-medium mb-2">
                  Payout Condition
                  <Tooltip wide content={<>Select the desired payout condition that must occur for the coverage payout to be parametrically made to the Hedge user.<br /><br />For example, a hedge user seeking to hedge against a 100-year geomagnetic event would select:<br /><br />Space Weather Index: <span className="font-semibold">Disturbance Storm Time (Dst)</span><br />Payout Condition: <span className="font-semibold">-850 nT (Extreme, 1859 Carrington)</span><br /><br />Note: Each payout condition has a unique probability of occurring, displayed as Annual Payout Odds.</>} />
                </label>
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
              </div>
              {condition && (
                <p className="text-xs text-muted-foreground">
                  Annual payout odds: <span className="text-red-500 font-medium">{(annualOdds * 100).toFixed(4)}%</span>
                </p>
              )}
            </div>

            <hr className="border-border mx-6" />

            {/* Contract Duration */}
            <div className="px-6 pt-2 pb-3">
              <label className="flex items-center gap-1.5 text-sm font-medium mb-2">
                Contract Duration
                <Tooltip wide content={<>This is the length of the resulting smart contract. The contract start date is the date and time the orders were matched; the end date is the start date plus this duration.</>} />
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

            {/* Coverage Sought */}
            <div className="px-6 pt-2 pb-3 flex items-center gap-4 justify-between">
              <div>
                <label className="flex items-center gap-1.5 text-sm font-medium mb-2">
                  Coverage Sought
                  <Tooltip wide content={<>Hedge users input the desired coverage sought, the dollar amount that will be paid out if the payout condition is met during the contract period.</>} />
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm select-none">$</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={coverage ? parseInt(coverage, 10).toLocaleString("en-US") : ""}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/,/g, "");
                      if (/^\d*$/.test(raw) && Number(raw) <= 10_000_000_000) {
                        setCoverage(raw);
                        setFieldErrors((er) => ({ ...er, coverage: false }));
                      }
                    }}
                    placeholder="0"
                    className={cn(
                      "w-full rounded-md border border-border bg-background pl-7 pr-3 py-2 text-sm",
                      fieldErrors.coverage && "ring-2 ring-red-500"
                    )}
                  />
                </div>
              </div>

              <div className="flex-1 text-center">
                {matchedTier && coverageNum > 0 && (
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Coverage tier: <span className="font-medium">{matchedTier.Name}</span><br />
                    Service fee rate:{" "}
                    <span className="font-medium">
                      {((currency === "USDC" ? matchedTier.USDCserviceFee : matchedTier.SSTMserviceFee) * 100).toFixed(2)}%
                    </span>
                  </p>
                )}
              </div>

              {/* Probability Based Hedge Premium */}
              <div className="flex items-center gap-2 shrink-0">
                <span className={cn("text-xs", adjEnabled && adj !== 1.0 ? "text-muted-foreground" : "text-muted-foreground")}>
                  Probability Based<br />Hedge Premium
                </span>
                <span className={cn("text-sm font-medium", adjEnabled && adj !== 1.0 ? "text-muted-foreground" : "")}>
                  {basePremium > 0 && tokenPrice > 0
                    ? `$${(basePremium * tokenPrice).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
                    : "—"}
                </span>
              </div>
            </div>
            </div>
          </section>

          {/* Section 2: Optional Features */}
          <section className="rounded-lg border border-border space-y-2">
            <h2 className="w-full bg-gray-200 dark:bg-gray-800 pl-3 pr-2 py-1.5 font-medium rounded-t-lg">
              <span className="font-bold">2.&nbsp;&nbsp;</span>Optional Order Features
            </h2>
            <div className="flex items-center h-[50px] px-6">
              {/* Label */}
              <div className="flex items-center gap-1.5 w-56 shrink-0 text-sm font-medium">
                Hedge Premium Adjustment
                <Tooltip wide content={<>This optional adjustment allows you to multiply the hedge premium paid to Cover parties to secure coverage.<br /><br />Toggle the feature on, then enter a multiplier (0.05× to 5.0×).<br /><br />A higher multiplier makes your order more attractive to Cover parties and speeds up matching. A lower multiplier reduces your cost but may take longer to match.<br /><br />Example: a 1.2× adjustment gives Cover parties a 20% premium increase over the standard probability-based rate.</>} />
              </div>

              {/* Toggle */}
              <div className="flex items-center gap-2 w-32 shrink-0">
                <button
                  type="button"
                  onClick={() => { setAdjEnabled((v) => !v); if (adjEnabled) setAdj(1.0); }}
                  className={cn(
                    "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors",
                    adjEnabled ? "bg-primary" : "bg-gray-400"
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
                <span className="text-sm text-muted-foreground">{adjEnabled ? "Enabled" : "Disabled"}</span>
              </div>

              {/* Number input + percentage — visible when enabled */}
              {adjEnabled && (
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={adj}
                    min={0.05}
                    max={5.0}
                    step={0.05}
                    onChange={(e) => setAdj(Math.max(0.05, Math.min(5.0, parseFloat(e.target.value) || 0.05)))}
                    className="w-20 rounded-md border border-border bg-background px-2 py-1 text-sm text-center"
                  />
                  {adj !== 1.0 && (
                    <span className="text-sm font-medium tabular-nums">
                      {adj > 1 ? "+" : ""}{((adj - 1) * 100).toFixed(0)}%
                    </span>
                  )}
                </div>
              )}

              <div className="grow" />

              {/* Adjusted premium — visible when enabled */}
              {adjEnabled && (
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-muted-foreground">
                    {adj === 1.0 ? "Hedge Premium" : <>Adjusted<br />Hedge Premium</>}
                  </span>
                  <span className="text-sm font-medium">
                    {adjustedPremium > 0 && tokenPrice > 0
                      ? `$${(adjustedPremium * tokenPrice).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
                      : "—"}
                  </span>
                </div>
              )}
            </div>
            <div className="pb-2" />
          </section>
        </div>

        {/* ── Right panel: Order Summary ──────────────────────────────────────── */}
        <div>
          <div className="rounded-lg border border-border space-y-4 sticky top-24">
            <h2 className="w-full bg-gray-200 dark:bg-gray-800 pl-3 pr-2 py-1.5 font-medium rounded-t-lg">
              <span className="font-bold">3.&nbsp;&nbsp;</span>Order Summary
            </h2>
            <div className="px-6 pb-6 space-y-4">

            {/* Always-visible rows */}
            <div className="space-y-2 text-sm">
              <SummaryRow label="Coverage Sought" value={coverageNum > 0 ? `$${coverageNum.toLocaleString()}` : "—"} />
              <SummaryRow
                label="Premium to Pay"
                value={
                  adjustedPremium > 0 && tokenPrice > 0
                    ? `$${(adjustedPremium * tokenPrice).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                    : "—"
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
              <div className="space-y-1.5 text-sm border-t border-border pt-3">
                <SummaryRow
                  label={`${currency || "Token"} Current Value`}
                  value={tokenPrice > 0 ? `$${tokenPrice.toFixed(4)}` : "—"}
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
                {orderExpiresAt && (
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
    <div className={cn("flex justify-between gap-2", small ? "text-sm" : "text-sm")}>
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className={cn("text-right", bold && "font-semibold", valueClass)}>
        {value}
        {sub && <span className="text-muted-foreground ml-1 font-normal">({sub})</span>}
      </span>
    </div>
  );
}
