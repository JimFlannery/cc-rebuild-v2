'use server';

import pool from '@/lib/db';
import type { OpenHedgeOrder } from './getOpenHedgeOrders';

export async function getOrderById(id: string): Promise<OpenHedgeOrder | null> {
  const [rows] = await pool.query(
    `SELECT
       o.id, o.WalletAddress AS walletAddress,
       o.IndexName AS indexName, o.IndexLevel AS indexLevel,
       o.IndexUnit AS indexUnit,
       o.PayoutProbability AS payoutProbability,
       o.Coverage AS coverage,
       o.HedgePremium AS hedgePremium,
       o.AdjustedHedgePremium AS adjustedHedgePremium,
       o.Denomination AS denomination,
       o.Duration AS contractDuration,
       o.Expiration AS expiration,
       o.FormattedExpiration AS formattedExpiration,
       o.CoverRewardAPY AS coverRewardAPY,
       o.Status AS status,
       o.OrderTaken AS orderTaken,
       o.createdAt,
       COALESCE(v.YieldBoostMinCoverage, 2000) AS yieldBoostMin
     FROM Orders o
     LEFT JOIN (SELECT YieldBoostMinCoverage FROM VariableSettings ORDER BY createdAt DESC LIMIT 1) v ON 1=1
     WHERE o.id = ?
       AND o.OrderType = 'Hedge'
       AND (o.IsLoopOrder = 0 OR o.IsLoopOrder IS NULL)`,
    [id]
  ) as [any[], unknown];

  const r = (rows as any[])[0];
  if (!r) return null;

  return {
    id: r.id,
    walletAddress: r.walletAddress,
    indexName: r.indexName,
    indexLevel: Number(r.indexLevel),
    indexUnit: r.indexUnit,
    payoutProbability: Number(r.payoutProbability),
    coverage: Number(r.coverage),
    hedgePremium: Number(r.hedgePremium),
    adjustedHedgePremium: Number(r.adjustedHedgePremium),
    denomination: r.denomination,
    contractDuration: Number(r.contractDuration),
    expiration: r.expiration,
    formattedExpiration: r.formattedExpiration,
    coverRewardAPY: r.coverRewardAPY != null ? Number(r.coverRewardAPY) : null,
    yieldBoostEligible: r.denomination === 'SSTM' && Number(r.coverage) >= Number(r.yieldBoostMin),
    createdAt: r.createdAt,
  };
}
