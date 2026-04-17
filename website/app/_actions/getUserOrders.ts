'use server';

import pool from '@/lib/db';

export interface UserOrder {
  id: string;
  orderType: string;
  status: string;
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
  tokenReward: number | null;
  coverPartyIncome: number | null;
  serviceFee: number;
  orderTaken: boolean;
  contractOutcome: number | null;
  isLoopOrder: boolean;
  createdAt: string;
}

export async function getUserOrders(walletAddress: string): Promise<UserOrder[]> {
  const [rows] = await pool.query(
    `SELECT
       id,
       OrderType          AS orderType,
       Status             AS status,
       IndexName          AS indexName,
       IndexLevel         AS indexLevel,
       IndexUnit          AS indexUnit,
       PayoutProbability  AS payoutProbability,
       Coverage           AS coverage,
       COALESCE(CoverageFilled, 0) AS coverageFilled,
       COALESCE(HedgePremium, 0) AS hedgePremium,
       COALESCE(AdjustedHedgePremium, 0) AS adjustedHedgePremium,
       Denomination       AS denomination,
       Duration           AS contractDuration,
       Expiration         AS expiration,
       FormattedExpiration AS formattedExpiration,
       CoverRewardAPY     AS coverRewardAPY,
       TokenReward        AS tokenReward,
       CoverPartyIncome   AS coverPartyIncome,
       COALESCE(ServiceFee, 0) AS serviceFee,
       COALESCE(OrderTaken, 0) AS orderTaken,
       ContractOutcome    AS contractOutcome,
       COALESCE(IsLoopOrder, 0) AS isLoopOrder,
       createdAt
     FROM Orders
     WHERE WalletAddress = ?
     ORDER BY createdAt DESC`,
    [walletAddress]
  );

  return (rows as any[]).map((r) => ({
    ...r,
    indexLevel: Number(r.indexLevel),
    payoutProbability: Number(r.payoutProbability),
    coverage: Number(r.coverage),
    coverageFilled: Number(r.coverageFilled),
    hedgePremium: Number(r.hedgePremium),
    adjustedHedgePremium: Number(r.adjustedHedgePremium),
    contractDuration: Number(r.contractDuration),
    coverRewardAPY: r.coverRewardAPY != null ? Number(r.coverRewardAPY) : null,
    tokenReward: r.tokenReward != null ? Number(r.tokenReward) : null,
    coverPartyIncome: r.coverPartyIncome != null ? Number(r.coverPartyIncome) : null,
    serviceFee: Number(r.serviceFee),
    orderTaken: !!r.orderTaken,
    contractOutcome: r.contractOutcome != null ? Number(r.contractOutcome) : null,
    isLoopOrder: !!r.isLoopOrder,
  }));
}
