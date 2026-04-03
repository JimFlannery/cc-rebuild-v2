"use client";

import { useState } from "react";
import { useAnchorWallet, useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { Program, AnchorProvider, BN } from "@coral-xyz/anchor";
import { cn } from "@/lib/utils";
import { matchTier, MINT_ADDRESSES, TOKEN_DECIMALS, PROGRAM_ID, INDEX_NAME_TO_ANCHOR } from "@/lib/orderConstants";
import { createHedgeOrder } from "@/app/_actions/createHedgeOrder";
import type { OpenHedgeOrder } from "@/app/_actions/getOpenHedgeOrders";
import type { Tier } from "@/app/_actions/getTiers";
import type { TokenPrices } from "@/app/_actions/prices";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const IDL = require("@/lib/idl/condition_cover.json");

interface Props {
  order: OpenHedgeOrder;
  tiers: Tier[];
  prices: TokenPrices;
}

export function CoverForm({ order, tiers, prices }: Props) {
  const { connected, publicKey } = useWallet();
  const anchorWallet = useAnchorWallet();
  const { connection } = useConnection();

  const [acknowledged, setAcknowledged] = useState(false);
  const [showConfirm, setShowConfirm]   = useState(false);
  const [submitting, setSubmitting]     = useState(false);
  const [fieldErrors, setFieldErrors]   = useState<Record<string, boolean>>({});
  const [result, setResult]             = useState<{ ok: boolean; sig?: string; error?: string } | null>(null);

  const tokenPrice = order.denomination === "USDC" ? prices.USDC
    : order.denomination === "SSTM" ? prices.SSTM : 0;

  const matchedTier = matchTier(tiers, order.coverage);
  const feeRate = order.denomination === "USDC"
    ? (matchedTier?.USDCserviceFee ?? 0)
    : (matchedTier?.SSTMserviceFee ?? 0);
  const apy = matchedTier?.APY ?? order.coverRewardAPY ?? 0;

  const premiumUsd = (order.adjustedHedgePremium ?? order.hedgePremium) * tokenPrice;
  const serviceFee = (order.adjustedHedgePremium ?? order.hedgePremium) * feeRate;
  const layer1Usd  = 0.15;
  const layer1Sol  = prices.SOL > 0 ? layer1Usd / prices.SOL : 0;
  const layer1Token = tokenPrice > 0 ? layer1Usd / tokenPrice : 0;

  // Annual reward estimate
  const annualReward = order.coverage * apy;
  const contractReward = order.contractDuration > 0 ? annualReward * order.contractDuration / 365 : 0;

  function validate(): Record<string, boolean> {
    const e: Record<string, boolean> = {};
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
      if (!anchorWallet || !publicKey) throw new Error("Wallet not connected");

      const mintAddress = new PublicKey(
        order.denomination === "USDC" ? MINT_ADDRESSES.USDC : MINT_ADDRESSES.SSTM
      );
      const programPubkey = new PublicKey(PROGRAM_ID);
      const provider = new AnchorProvider(connection, anchorWallet, { commitment: "confirmed" });
      const program  = new Program(IDL, provider);

      const nonce    = new BN(Date.now());
      const nonceBuf = nonce.toArrayLike(Buffer, "le", 8);

      const [orderPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("order"), publicKey.toBuffer(), nonceBuf],
        programPubkey
      );
      const [escrowPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("escrow"), orderPda.toBuffer()],
        programPubkey
      );

      const ownerTokenAccount = getAssociatedTokenAddressSync(mintAddress, publicKey);
      const coverageUnits = Math.round(order.coverage / tokenPrice * 10 ** TOKEN_DECIMALS);
      const premiumUnits  = Math.round((order.adjustedHedgePremium ?? order.hedgePremium) * 10 ** TOKEN_DECIMALS);

      // Order expiration: match the hedge order's expiration or far-future fallback
      const expirationUnix = order.expiration
        ? Math.floor(new Date(order.expiration).getTime() / 1000)
        : Math.floor(new Date("2099-12-31").getTime() / 1000);

      const indexKey = order.indexName.includes("Disturbance") ? "Dst"
        : order.indexName.includes("Planetary") ? "Kp" : "Dst";

      const sig = await (program.methods as any)
        .createOrder(
          nonce,
          { cover: {} },
          INDEX_NAME_TO_ANCHOR[indexKey as "Dst" | "Kp"],
          new BN(order.indexLevel),
          new BN(coverageUnits),
          new BN(premiumUnits),
          new BN(expirationUnix),
          order.denomination === "USDC" ? { usdc: {} } : { sstm: {} }
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

      // Write cover order to MySQL
      await createHedgeOrder({
        orderTiming: "Committed",
        orderDuration: order.contractDuration,
        expirationDate: order.expiration,
        formattedExpiration: order.formattedExpiration,
        currency: order.denomination as "USDC" | "SSTM",
        contractDuration: order.contractDuration,
        indexName: order.indexName,
        indexLevel: order.indexLevel,
        indexUnit: order.indexUnit,
        payoutProbability: order.payoutProbability,
        coverage: order.coverage,
        hedgePremium: order.hedgePremium,
        hedgePremiumAdjustment: 1,
        adjustedHedgePremium: order.adjustedHedgePremium ?? order.hedgePremium,
        serviceFee,
        totalServiceFees: serviceFee + layer1Token,
        gasFeeLayer1: layer1Sol,
        walletAddress: publicKey.toBase58(),
        orderAddress: orderPda.toBase58(),
        denominationAddress: mintAddress.toBase58(),
      });

      setResult({ ok: true, sig });
      setAcknowledged(false);
      setFieldErrors({});
    } catch (err) {
      setResult({ ok: false, error: err instanceof Error ? err.message : String(err) });
    } finally {
      setSubmitting(false);
    }
  }

  const alreadyMatched = !!order.orderTaken;

  return (
    <>
      <div className="rounded-lg border border-border sticky top-24">
        <h2 className="w-full bg-gray-200 dark:bg-gray-800 pl-3 pr-2 py-1.5 font-medium rounded-t-lg text-sm">
          Provide Cover
        </h2>
        <div className="px-5 py-5 space-y-4">

          {alreadyMatched ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              This order has already been matched.
            </p>
          ) : (
            <>
              {/* Order summary */}
              <div className="space-y-2">
                <SummaryRow label="Coverage to Lock"
                  value={`$${order.coverage.toLocaleString()}`} />
                <SummaryRow label="Premium You Receive"
                  value={`$${premiumUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                  valueClass="text-green-600 dark:text-green-400" />
                <SummaryRow label="Contract Duration"
                  value={`${order.contractDuration} days`} />
                <SummaryRow label="Payout Probability"
                  value={`${(order.payoutProbability * 100).toFixed(4)}%`}
                  valueClass="text-red-500" />
              </div>

              <div className="border-t border-border pt-3 space-y-2">
                <SummaryRow label="Cover APY"
                  value={apy > 0 ? `${(apy * 100).toFixed(1)}%` : "—"}
                  valueClass="text-green-600 dark:text-green-400" />
                {matchedTier && (
                  <SummaryRow label="Tier" value={matchedTier.Name} />
                )}
                <SummaryRow label={`Est. Reward (${order.contractDuration}d)`}
                  value={contractReward > 0 ? `$${contractReward.toLocaleString("en-US", { maximumFractionDigits: 0 })}` : "—"} />
                <SummaryRow label="Service Fee Rate"
                  value={`${(feeRate * 100).toFixed(2)}%`} />
                <SummaryRow label="Service Fee"
                  value={serviceFee > 0 ? `${serviceFee.toFixed(4)} ${order.denomination}` : "—"} small />
                <SummaryRow label="Layer 1 Gas"
                  value={`${layer1Sol.toFixed(6)} SOL`} small />
              </div>

              {order.yieldBoostEligible && (
                <div className="rounded-md bg-amber-50/50 dark:bg-amber-950/30 border border-amber-400/40 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                  ✦ Yield Boost can amplify your returns on this order after matching.
                </div>
              )}

              {/* Acknowledgement */}
              <div className="border-t border-border pt-3 space-y-3">
                <label className={cn(
                  "flex items-start gap-2 text-xs cursor-pointer",
                  fieldErrors.acknowledged && "text-red-500"
                )}>
                  <input
                    type="checkbox"
                    checked={acknowledged}
                    onChange={(e) => { setAcknowledged(e.target.checked); setFieldErrors({}); }}
                    className="mt-0.5 accent-primary shrink-0"
                  />
                  <span>
                    I understand that providing cover locks my{" "}
                    <span className="font-medium">{order.denomination}</span> in a Solana smart
                    contract escrow until settlement and agree to the{" "}
                    <a href="/legal" className="underline" target="_blank" rel="noopener noreferrer">
                      terms and legal disclaimer
                    </a>.
                  </span>
                </label>

                {!isValid && (
                  <p className="text-xs text-muted-foreground text-center">
                    Acknowledge the terms to continue
                  </p>
                )}
                {!connected && (
                  <p className="text-xs text-amber-500 text-center">
                    Connect your wallet to submit
                  </p>
                )}

                <button
                  type="button"
                  onClick={handleSubmitClick}
                  disabled={submitting || !connected}
                  className="w-full rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {submitting ? "Submitting…" : "Provide Cover"}
                </button>
              </div>

              {result && (
                <div className={cn(
                  "rounded-md p-3 text-xs",
                  result.ok
                    ? "bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-200"
                    : "bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200"
                )}>
                  {result.ok ? (
                    <>
                      <p className="font-semibold">Cover order placed!</p>
                      {result.sig && (
                        <a
                          href={`https://explorer.solana.com/tx/${result.sig}?cluster=devnet`}
                          target="_blank" rel="noopener noreferrer"
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
            </>
          )}
        </div>
      </div>

      {/* Confirmation modal */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-sm rounded-xl bg-background border border-border p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-semibold">Confirm Cover Order</h3>
            <p className="text-xs text-muted-foreground">
              Your coverage will be locked in a Solana smart contract escrow. Review before confirming.
            </p>
            <div className="space-y-2 text-sm">
              <SummaryRow label="Coverage" value={`$${order.coverage.toLocaleString()}`} />
              <SummaryRow label="Premium Received" value={`$${premiumUsd.toFixed(2)}`} valueClass="text-green-600 dark:text-green-400" />
              <SummaryRow label="Payout Trigger" value={`${order.indexName.includes("Disturbance") ? "Dst" : "Kp"} ${order.indexLevel < 0 ? `< ${order.indexLevel}` : `≥ ${order.indexLevel / 100}`} ${order.indexUnit}`} />
              <SummaryRow label="Duration" value={`${order.contractDuration} days`} />
              <SummaryRow label="Payout Probability" value={`${(order.payoutProbability * 100).toFixed(4)}%`} valueClass="text-red-500" />
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setShowConfirm(false)}
                className="flex-1 rounded-md border border-border px-4 py-2 text-sm hover:bg-accent transition-colors">
                Cancel
              </button>
              <button onClick={handleConfirm}
                className="flex-1 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity">
                Confirm & Submit
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// Overloaded SummaryRow that accepts `small` prop
function SummaryRow({
  label, value, sub, bold, valueClass, small,
}: {
  label: string; value: string; sub?: string; bold?: boolean; valueClass?: string; small?: boolean;
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
