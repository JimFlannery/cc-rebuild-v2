"use client";

import { useState } from "react";
import { useAnchorWallet, useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { Program, AnchorProvider, BN } from "@coral-xyz/anchor";
import { cn } from "@/lib/utils";
import { matchTier, MINT_ADDRESSES, TOKEN_DECIMALS, PROGRAM_ID } from "@/lib/orderConstants";
import { shortWallet } from "@/lib/orderFormat";
import { matchLoopOrder } from "@/app/_actions/matchLoopOrder";
import type { LoopOrderDetail } from "@/app/_actions/getLoopOrderById";
import type { LoopSettings } from "@/app/_actions/getLoopSettings";
import type { TokenPrices } from "@/app/_actions/prices";
import type { Tier } from "@/app/_actions/getTiers";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const IDL = require("@/lib/idl/condition_cover.json");

const COMMUNITY_MIN_USD = 2_000;

// ── Helpers ──────────────────────────────────────────────────────────────────

function usd(n: number, decimals = 0): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}
function pct(n: number, decimals = 2): string {
  return `${(n * 100).toFixed(decimals)}%`;
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

function calcProjections(coverageUsd: number, numLoops: number, settings: LoopSettings): Projections | null {
  if (coverageUsd <= 0 || numLoops <= 0) return null;
  const ltv = settings.LoopLTV;
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
    leverage, totalCoverUsd, totalLoansUsd,
    grossAnnualRewardsUsd, annualInterestUsd, upfrontFeeUsd,
    netAnnualIncomeUsd, effectiveAPY, amplification,
  };
}

// ── Component ────────────────────────────────────────────────────────────────

interface Props {
  order: LoopOrderDetail;
  settings: LoopSettings;
  prices: TokenPrices;
  tiers: Tier[];
}

export function MatchForm({ order, settings, prices, tiers }: Props) {
  const { connected, publicKey } = useWallet();
  const anchorWallet = useAnchorWallet();
  const { connection } = useConnection();

  const isCommunity = order.isCommunityOrder;
  const isOwn = !!publicKey && order.walletAddress === publicKey.toBase58();

  const sought = order.coverageSought ?? 0;
  const filled = order.coverageFilled ?? 0;
  const remaining = Math.max(0, sought - filled);

  const [amount, setAmount] = useState<string>(isCommunity ? "" : String(order.coverageUsd));
  const [acknowledged, setAcknowledged] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; error?: string } | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, boolean>>({});

  const amountNum = isCommunity
    ? Math.max(0, parseInt(amount.replace(/,/g, ""), 10) || 0)
    : order.coverageUsd;

  const numLoops = isCommunity ? settings.LoopDefaultLoops : order.numLoops;

  const tier = matchTier(tiers, amountNum);
  const baseAPY = tier?.APY ?? 0;
  const loanAPR = tier?.LoopLoanAPR ?? settings.LoopLoanAPR;
  const effectiveSettings = { ...settings, LoopRewardAPY: baseAPY, LoopLoanAPR: loanAPR };
  const proj = calcProjections(amountNum, numLoops, effectiveSettings);

  const tooLow = isCommunity && amountNum > 0 && amountNum < COMMUNITY_MIN_USD;
  const tooHigh = isCommunity && amountNum > remaining;

  function validate(): Record<string, boolean> {
    const e: Record<string, boolean> = {};
    if (isCommunity) {
      if (amountNum < COMMUNITY_MIN_USD) e.amount = true;
      if (amountNum > remaining) e.amount = true;
    }
    if (!acknowledged) e.acknowledged = true;
    return e;
  }

  async function handleSubmit() {
    const errors = validate();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSubmitting(true);
    setResult(null);

    try {
      if (!anchorWallet || !publicKey) throw new Error("Wallet not connected");
      if (!proj) throw new Error("Could not calculate projections");

      const coverageUsd = amountNum;

      const sstmMint = new PublicKey(MINT_ADDRESSES.SSTM);
      const programPubkey = new PublicKey(PROGRAM_ID);
      const provider = new AnchorProvider(connection, anchorWallet, { commitment: "confirmed" });
      const program = new Program(IDL, provider);

      const user1Pubkey = new PublicKey(order.walletAddress);
      const user2Pubkey = publicKey;
      const loopNonce = new BN(Date.now());
      const nonceBuf = loopNonce.toArrayLike(Buffer, "le", 8);

      // TODO: fetch user1's four seed order PDAs from the Orders table rather than re-deriving.
      const [user1CoverOrder] = PublicKey.findProgramAddressSync(
        [Buffer.from("order"), user1Pubkey.toBuffer(), nonceBuf],
        programPubkey
      );
      const [user1HedgeOrder] = PublicKey.findProgramAddressSync(
        [Buffer.from("order"), user1Pubkey.toBuffer(), new BN(loopNonce.toNumber() + 1).toArrayLike(Buffer, "le", 8)],
        programPubkey
      );

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
      const coverageUnits = new BN(Math.round(coverageUsd * 10 ** TOKEN_DECIMALS));
      const premiumUnits = new BN(Math.round(coverageUsd * 0.012 * 10 ** TOKEN_DECIMALS));
      const expirationUnix = new BN(Math.floor(Date.now() / 1000) + order.contractDuration * 86400);
      const DST_LEVEL = new BN(-85000);

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

      // Create LoopSet
      const [loopSetPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("loop_set"), user1Pubkey.toBuffer(), user2Pubkey.toBuffer(), nonceBuf],
        programPubkey
      );
      const rewardApyBps = Math.round(effectiveSettings.LoopRewardAPY * 10_000);
      const loanAprBps = Math.round(effectiveSettings.LoopLoanAPR * 10_000);
      const ltvBps = Math.round(settings.LoopLTV * 10_000);
      const feeBps = Math.round(settings.LoopFeePct * 10_000);

      await (program.methods as any)
        .createLoopSet(loopNonce, numLoops,
          rewardApyBps, loanAprBps, ltvBps, feeBps, expirationUnix)
        .accounts({
          loopSet: loopSetPda,
          user1CoverOrder, user1HedgeOrder, user2HedgeOrder, user2CoverOrder,
          creator: user2Pubkey, systemProgram: SystemProgram.programId,
        }).rpc();

      // Match A-pair (user1 Cover ↔ user2 Hedge)
      const [user1CoverEscrow] = PublicKey.findProgramAddressSync(
        [Buffer.from("escrow"), user1CoverOrder.toBuffer()], programPubkey
      );
      const [user1HedgeEscrow] = PublicKey.findProgramAddressSync(
        [Buffer.from("escrow"), user1HedgeOrder.toBuffer()], programPubkey
      );
      const user1TokenAccount = getAssociatedTokenAddressSync(sstmMint, user1Pubkey);

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

      // Match B-pair (user1 Hedge ↔ user2 Cover)
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

      for (const contractPda of [contractA, contractB]) {
        await (program.methods as any).registerLoopContract()
          .accounts({
            loopSet: loopSetPda,
            contract: contractPda,
            caller: user2Pubkey,
          }).rpc();
      }

      await matchLoopOrder({
        seedOrderId: order.id,
        matcherWalletAddress: user2Pubkey.toBase58(),
        loopSetAddress: loopSetPda.toBase58(),
        contractAAddress: contractA.toBase58(),
        contractBAddress: contractB.toBase58(),
        numLoops,
        coverageUsd,
        contractDuration: order.contractDuration,
        effectiveAPY: proj.effectiveAPY,
        upfrontFeeUsd: proj.upfrontFeeUsd,
        totalCoverUsd: proj.totalCoverUsd,
        totalLoansUsd: proj.totalLoansUsd,
        totalInterestUsd: proj.annualInterestUsd * order.contractDuration / 365,
      });

      setResult({ ok: true });
    } catch (err) {
      setResult({ ok: false, error: err instanceof Error ? err.message : String(err) });
    } finally {
      setSubmitting(false);
    }
  }

  const pctFilled = sought > 0 ? (filled / sought) * 100 : 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-6">

      {/* ── Left: Order details ────────────────────────────────────────────── */}
      <div className="space-y-5">

        <section className="rounded-lg border border-border">
          <h2 className="bg-gray-200 dark:bg-gray-800 px-4 py-2 text-sm font-medium rounded-t-lg">
            Order Details
          </h2>
          <div className="px-4 py-4 grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4 text-sm">
            <DetailItem label="Type" value={isCommunity ? "Community Pool" : "Peer-to-Peer"} />
            <DetailItem
              label={isCommunity ? "Pool Size" : "Coverage"}
              value={usd(isCommunity ? sought : order.coverageUsd)}
            />
            {isCommunity && <DetailItem label="Already Filled" value={usd(filled)} />}
            {isCommunity && <DetailItem label="Remaining" value={usd(remaining)} />}
            <DetailItem label="Loops" value={String(numLoops)} />
            <DetailItem label="Contract Duration" value={`${order.contractDuration} days`} />
            <DetailItem label="Currency" value="SSTM" />
            <DetailItem label="Trigger" value="Dst < −850 nT" />
            <DetailItem label="Order Expires" value={order.formattedExpiration ?? "Good-till-cancelled"} />
            <DetailItem label="Counterparty" value={isCommunity ? "Platform Pool" : shortWallet(order.walletAddress)} />
          </div>
        </section>

        {isCommunity && sought > 0 && (
          <section className="rounded-lg border border-border">
            <h2 className="bg-gray-200 dark:bg-gray-800 px-4 py-2 text-sm font-medium rounded-t-lg">
              Pool Progress
            </h2>
            <div className="px-4 py-4 space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Filled</span>
                <span className="font-medium">{usd(filled)} / {usd(sought)} ({pctFilled.toFixed(0)}%)</span>
              </div>
              <div className="h-2 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                <div
                  className="h-full rounded-full bg-indigo-500 transition-all duration-300"
                  style={{ width: `${Math.min(100, pctFilled)}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">{usd(remaining)} remaining</p>
            </div>
          </section>
        )}

        <section className="rounded-lg border border-border">
          <h2 className="bg-gray-200 dark:bg-gray-800 px-4 py-2 text-sm font-medium rounded-t-lg">
            Platform Terms
          </h2>
          <div className="px-4 py-4 grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3 text-sm">
            <DetailItem label="Loan APR" value={pct(loanAPR)} sub="from treasury" />
            <DetailItem label="Loan LTV" value={pct(settings.LoopLTV)} />
            <DetailItem label="Contract Service Fee" value={pct(settings.LoopFeePct)} sub="USDC, upfront" />
            <DetailItem label="Base Reward APY" value={baseAPY > 0 ? pct(baseAPY) : "—"} sub={tier?.Name ?? undefined} />
          </div>
          <p className="px-4 pb-4 text-xs text-muted-foreground">
            Premiums cancel out between counterparties — your net premium cost is zero.
            Treasury loans are issued in SSTM and repaid from your rewards pool at settlement.
          </p>
        </section>
      </div>

      {/* ── Right: Action form ─────────────────────────────────────────────── */}
      <div>
        <div className="rounded-lg border border-border sticky top-24">
          <h2 className="w-full bg-gray-200 dark:bg-gray-800 pl-3 pr-2 py-1.5 font-medium rounded-t-lg text-sm">
            {isCommunity ? "Join Pool" : "Match Order"}
          </h2>
          <div className="px-5 py-5 space-y-4">

            {isOwn ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                This is your own order. You cannot match it yourself.
              </p>
            ) : !isCommunity && order.orderTaken ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                This order has already been matched.
              </p>
            ) : isCommunity && remaining <= 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                This pool is full.
              </p>
            ) : (
              <>
                {isCommunity ? (
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">
                      Your Contribution ($)
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm select-none">$</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={amountNum > 0 ? amountNum.toLocaleString("en-US") : ""}
                        onChange={(e) => {
                          const raw = e.target.value.replace(/,/g, "");
                          if (/^\d*$/.test(raw)) {
                            setAmount(raw);
                            setFieldErrors((er) => ({ ...er, amount: false }));
                          }
                        }}
                        placeholder={`${COMMUNITY_MIN_USD.toLocaleString("en-US")} – ${remaining.toLocaleString("en-US")}`}
                        className={cn(
                          "w-full rounded-md border border-border bg-background pl-7 pr-3 py-2 text-sm",
                          (fieldErrors.amount || tooLow || tooHigh) && amountNum > 0 && "ring-2 ring-red-500"
                        )}
                      />
                    </div>
                    {tooLow && (
                      <p className="text-xs text-red-500 mt-1">
                        Minimum contribution is ${COMMUNITY_MIN_USD.toLocaleString("en-US")}
                      </p>
                    )}
                    {tooHigh && (
                      <p className="text-xs text-red-500 mt-1">
                        Exceeds remaining capacity of {usd(remaining)}
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setAmount(String(remaining));
                        setFieldErrors((er) => ({ ...er, amount: false }));
                      }}
                      className="text-xs text-primary hover:underline mt-1"
                    >
                      Fill remaining ({usd(remaining)})
                    </button>
                    <p className="text-xs text-muted-foreground mt-2">
                      ≈ {Math.round(amountNum / prices.SSTM).toLocaleString("en-US")} SSTM tokens
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Your Coverage</span>
                      <span className="font-medium">{usd(order.coverageUsd)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Matching this P2P order takes the entire position in one transaction.
                    </p>
                  </div>
                )}

                {proj && amountNum > 0 && !tooLow && !tooHigh && (
                  <div className="border-t border-border pt-3 space-y-2 text-sm">
                    <SummaryRow
                      label="Effective APY"
                      value={pct(proj.effectiveAPY)}
                      valueClass="text-green-600 dark:text-green-400 font-semibold"
                    />
                    <SummaryRow
                      label="Amplification"
                      value={`${proj.amplification.toFixed(2)}×`}
                      sub={`vs ${pct(baseAPY)} base`}
                    />
                    <SummaryRow label="Leverage" value={`${proj.leverage.toFixed(2)}×`} />
                    <SummaryRow label="Total Cover Deployed" value={usd(proj.totalCoverUsd)} />
                    <SummaryRow label="Treasury Loan" value={usd(proj.totalLoansUsd)} />
                    <SummaryRow label="Upfront Fee" value={usd(proj.upfrontFeeUsd)} sub="USDC" />
                    <div className="border-t border-border pt-2">
                      <SummaryRow
                        label={`Income (${order.contractDuration}d)`}
                        value={usd(proj.netAnnualIncomeUsd * order.contractDuration / 365)}
                        bold
                      />
                    </div>
                  </div>
                )}

                <div className="border-t border-border pt-3 space-y-3">
                  <label className={cn(
                    "flex items-start gap-2 text-xs cursor-pointer",
                    fieldErrors.acknowledged && "text-red-500"
                  )}>
                    <input
                      type="checkbox"
                      checked={acknowledged}
                      onChange={(e) => {
                        setAcknowledged(e.target.checked);
                        setFieldErrors((er) => ({ ...er, acknowledged: false }));
                      }}
                      className="mt-0.5 accent-primary shrink-0"
                    />
                    <span>
                      I understand that {isCommunity ? "joining this pool" : "matching this order"} locks
                      my SSTM tokens in a delta-neutral looping position and agree to the{" "}
                      <a href="/legal" className="underline" target="_blank" rel="noopener noreferrer">
                        terms and legal disclaimer
                      </a>.
                    </span>
                  </label>

                  {!connected && (
                    <p className="text-xs text-amber-500 text-center">
                      Connect your wallet to submit
                    </p>
                  )}

                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={submitting || !connected}
                    className="w-full rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
                  >
                    {submitting
                      ? "Deploying…"
                      : isCommunity ? "Join Pool" : "Match Order"}
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
                      <p className="font-semibold">
                        {isCommunity ? "Joined the pool!" : "Matched!"} Initial contracts are now active.
                      </p>
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
      </div>
    </div>
  );
}

function DetailItem({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

function SummaryRow({
  label, value, sub, valueClass, bold,
}: {
  label: string; value: string; sub?: string; valueClass?: string; bold?: boolean;
}) {
  return (
    <div className="flex justify-between gap-2 text-sm">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className={cn("text-right", bold && "font-semibold", valueClass)}>
        {value}
        {sub && <span className="text-muted-foreground ml-1 font-normal">({sub})</span>}
      </span>
    </div>
  );
}
