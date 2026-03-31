'use server';

import pool from '@/lib/db';

export interface MarketMetrics {
  coverSupply: number;
  coverSupplyCount: number;
  coverDemand: number;
  coverDemandCount: number;
  premiumsEarned: number;
  coverSecured: number;
  tokenRewardsEarned: number;
  totalIncomeEarned: number;
  tvlSstm: number;
  tvlSstmCount: number;
  tvlUsdc: number;
  tvlUsdcCount: number;
}

export interface UserRiskMetrics {
  covSup: number;
  covSupCount: number;
  covSupMinProb: number;
  covSupMaxProb: number;
  hedSec: number;
  hedSecCount: number;
  hedSecMinProb: number;
  hedSecMaxProb: number;
  hedPen: number;
  hedPenCount: number;
  hedPenMinProb: number;
  hedPenMaxProb: number;
  covRisk: number;
  covRiskCount: number;
  covRiskMinProb: number;
  covRiskMaxProb: number;
}

export async function getMarketMetrics(): Promise<MarketMetrics> {
  const [rows] = await pool.query(`
    SELECT
      COALESCE(SUM(CASE WHEN OrderType='Cover'  AND Status='Open'                           THEN Coverage            ELSE 0 END), 0) AS coverSupply,
      COALESCE(COUNT(CASE WHEN OrderType='Cover' AND Status='Open'                          THEN 1 END), 0)                         AS coverSupplyCount,
      COALESCE(SUM(CASE WHEN OrderType='Hedge'  AND Status='Open'                           THEN Coverage            ELSE 0 END), 0) AS coverDemand,
      COALESCE(COUNT(CASE WHEN OrderType='Hedge' AND Status='Open'                          THEN 1 END), 0)                         AS coverDemandCount,
      COALESCE(SUM(CASE WHEN OrderType='Hedge'  AND Status IN ('Matched','Settled')         THEN AdjustedHedgePremium ELSE 0 END), 0) AS premiumsEarned,
      COALESCE(SUM(CASE WHEN OrderType='Hedge'  AND Status IN ('Matched','Settled')         THEN Coverage            ELSE 0 END), 0) AS coverSecured,
      COALESCE(SUM(CASE WHEN OrderType='Hedge'  AND Status IN ('Matched','Settled')         THEN TokenReward         ELSE 0 END), 0) AS tokenRewardsEarned,
      COALESCE(SUM(CASE WHEN OrderType='Hedge'  AND Status IN ('Matched','Settled')         THEN CoverPartyIncome    ELSE 0 END), 0) AS totalIncomeEarned,
      COALESCE(SUM(CASE WHEN OrderType='Hedge'  AND Status='Matched' AND Denomination='SSTM' THEN Coverage           ELSE 0 END), 0) AS tvlSstm,
      COALESCE(COUNT(CASE WHEN OrderType='Hedge' AND Status='Matched' AND Denomination='SSTM' THEN 1 END), 0)                       AS tvlSstmCount,
      COALESCE(SUM(CASE WHEN OrderType='Hedge'  AND Status='Matched' AND Denomination='USDC' THEN Coverage           ELSE 0 END), 0) AS tvlUsdc,
      COALESCE(COUNT(CASE WHEN OrderType='Hedge' AND Status='Matched' AND Denomination='USDC' THEN 1 END), 0)                       AS tvlUsdcCount
    FROM Orders
    WHERE Status != 'Cancelled'
  `) as [MarketMetrics[], unknown];

  return rows[0] ?? {
    coverSupply: 0, coverSupplyCount: 0,
    coverDemand: 0, coverDemandCount: 0,
    premiumsEarned: 0, coverSecured: 0,
    tokenRewardsEarned: 0, totalIncomeEarned: 0,
    tvlSstm: 0, tvlSstmCount: 0,
    tvlUsdc: 0, tvlUsdcCount: 0,
  };
}

export async function getUserRiskMetrics(walletAddress: string): Promise<UserRiskMetrics> {
  const [rows] = await pool.query(`
    SELECT
      COALESCE(SUM(CASE WHEN OrderType='Cover' AND Status='Matched'               THEN Coverage ELSE 0 END), 0)          AS covSup,
      COALESCE(COUNT(CASE WHEN OrderType='Cover' AND Status='Matched'             THEN 1 END), 0)                         AS covSupCount,
      COALESCE(MIN(CASE WHEN OrderType='Cover' AND Status='Matched'               THEN PayoutProbability END), 0)         AS covSupMinProb,
      COALESCE(MAX(CASE WHEN OrderType='Cover' AND Status='Matched'               THEN PayoutProbability END), 0)         AS covSupMaxProb,

      COALESCE(SUM(CASE WHEN OrderType='Hedge' AND Status='Matched' AND MOS=1     THEN Coverage ELSE 0 END), 0)           AS hedSec,
      COALESCE(COUNT(CASE WHEN OrderType='Hedge' AND Status='Matched' AND MOS=1   THEN 1 END), 0)                         AS hedSecCount,
      COALESCE(MIN(CASE WHEN OrderType='Hedge' AND Status='Matched' AND MOS=1     THEN PayoutProbability END), 0)         AS hedSecMinProb,
      COALESCE(MAX(CASE WHEN OrderType='Hedge' AND Status='Matched' AND MOS=1     THEN PayoutProbability END), 0)         AS hedSecMaxProb,

      COALESCE(SUM(CASE WHEN OrderType='Hedge' AND Status='Open' AND MOS=1        THEN Coverage ELSE 0 END), 0)           AS hedPen,
      COALESCE(COUNT(CASE WHEN OrderType='Hedge' AND Status='Open' AND MOS=1      THEN 1 END), 0)                         AS hedPenCount,
      COALESCE(MIN(CASE WHEN OrderType='Hedge' AND Status='Open' AND MOS=1        THEN PayoutProbability END), 0)         AS hedPenMinProb,
      COALESCE(MAX(CASE WHEN OrderType='Hedge' AND Status='Open' AND MOS=1        THEN PayoutProbability END), 0)         AS hedPenMaxProb,

      COALESCE(SUM(CASE WHEN OrderType='Cover' AND Status='Matched' AND MOS=0     THEN Coverage ELSE 0 END), 0)           AS covRisk,
      COALESCE(COUNT(CASE WHEN OrderType='Cover' AND Status='Matched' AND MOS=0   THEN 1 END), 0)                         AS covRiskCount,
      COALESCE(MIN(CASE WHEN OrderType='Cover' AND Status='Matched' AND MOS=0     THEN PayoutProbability END), 0)         AS covRiskMinProb,
      COALESCE(MAX(CASE WHEN OrderType='Cover' AND Status='Matched' AND MOS=0     THEN PayoutProbability END), 0)         AS covRiskMaxProb
    FROM Orders
    WHERE WalletAddress = ? AND Status != 'Cancelled'
  `, [walletAddress]) as [UserRiskMetrics[], unknown];

  return rows[0] ?? {
    covSup: 0, covSupCount: 0, covSupMinProb: 0, covSupMaxProb: 0,
    hedSec: 0, hedSecCount: 0, hedSecMinProb: 0, hedSecMaxProb: 0,
    hedPen: 0, hedPenCount: 0, hedPenMinProb: 0, hedPenMaxProb: 0,
    covRisk: 0, covRiskCount: 0, covRiskMinProb: 0, covRiskMaxProb: 0,
  };
}
