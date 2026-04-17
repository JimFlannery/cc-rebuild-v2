'use server';

import pool from '@/lib/db';

export interface MyOrder {
  id: string;
  orderType: 'Hedge' | 'Cover';
  status: string;
  walletAddress: string;
  indexName: string;
  indexLevel: number;
  indexUnit: string;
  payoutProbability: number;
  coverage: number;
  coverageFilled: number;
  hedgePremium: number;
  adjustedHedgePremium: number;
  denomination: string;
  contractDuration: number;
  expiration: string | null;
  formattedExpiration: string | null;
  coverRewardAPY: number | null;
  serviceFee: number;
  totalServiceFees: number;
  tokenReward: number | null;
  coverPartyIncome: number | null;
  orderTaken: boolean;
  contractOutcome: number | null;
  isLoopOrder: boolean;
  orderAddress: string | null;
  denominationAddress: string | null;
  matchingOrderID: string | null;
  createdAt: string;
}

export async function getMyOrderById(
  id: string,
  walletAddress: string
): Promise<MyOrder | null> {
  const [rows] = await pool.query(
    `SELECT
       id,
       OrderType           AS orderType,
       Status              AS status,
       WalletAddress       AS walletAddress,
       IndexName           AS indexName,
       IndexLevel          AS indexLevel,
       IndexUnit           AS indexUnit,
       PayoutProbability   AS payoutProbability,
       Coverage            AS coverage,
       COALESCE(CoverageFilled, 0) AS coverageFilled,
       COALESCE(HedgePremium, 0) AS hedgePremium,
       COALESCE(AdjustedHedgePremium, 0) AS adjustedHedgePremium,
       Denomination        AS denomination,
       Duration            AS contractDuration,
       Expiration          AS expiration,
       FormattedExpiration AS formattedExpiration,
       CoverRewardAPY      AS coverRewardAPY,
       COALESCE(ServiceFee, 0)       AS serviceFee,
       COALESCE(TotalServiceFees, 0) AS totalServiceFees,
       TokenReward         AS tokenReward,
       CoverPartyIncome    AS coverPartyIncome,
       COALESCE(OrderTaken, 0) AS orderTaken,
       ContractOutcome     AS contractOutcome,
       COALESCE(IsLoopOrder, 0) AS isLoopOrder,
       OrderAddress        AS orderAddress,
       DenominationAddress AS denominationAddress,
       MatchingOrderID     AS matchingOrderID,
       createdAt
     FROM Orders
     WHERE id = ? AND WalletAddress = ?`,
    [id, walletAddress]
  );

  const r = (rows as any[])[0];
  if (!r) return null;

  return {
    ...r,
    indexLevel: Number(r.indexLevel),
    payoutProbability: Number(r.payoutProbability),
    coverage: Number(r.coverage),
    coverageFilled: Number(r.coverageFilled),
    hedgePremium: Number(r.hedgePremium),
    adjustedHedgePremium: Number(r.adjustedHedgePremium),
    contractDuration: Number(r.contractDuration),
    coverRewardAPY: r.coverRewardAPY != null ? Number(r.coverRewardAPY) : null,
    serviceFee: Number(r.serviceFee),
    totalServiceFees: Number(r.totalServiceFees),
    tokenReward: r.tokenReward != null ? Number(r.tokenReward) : null,
    coverPartyIncome: r.coverPartyIncome != null ? Number(r.coverPartyIncome) : null,
    orderTaken: !!r.orderTaken,
    contractOutcome: r.contractOutcome != null ? Number(r.contractOutcome) : null,
    isLoopOrder: !!r.isLoopOrder,
  };
}
