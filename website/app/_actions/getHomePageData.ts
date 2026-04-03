'use server';

import pool from '@/lib/db';

export interface HomePageOrderMatch {
  id: string;
  coverage: number;
  denomination: string;
  indexName: string;
  indexLevel: number;
  indexUnit: string;
  payoutProbability: number;
  contractDuration: number;
  adjustedHedgePremium: number;
}

/**
 * Finds the open Hedge order closest to the target coverage (within 20%)
 * for the given denomination. Used to wire homepage cards directly to orders.
 */
export async function findBestMatchingOrder(
  denomination: "USDC" | "SSTM",
  targetCoverage: number
): Promise<HomePageOrderMatch | null> {
  const low  = targetCoverage * 0.8;
  const high = targetCoverage * 1.2;

  const [rows] = await pool.query(
    `SELECT id, Coverage AS coverage, Denomination AS denomination,
            IndexName AS indexName, IndexLevel AS indexLevel, IndexUnit AS indexUnit,
            PayoutProbability AS payoutProbability, Duration AS contractDuration,
            AdjustedHedgePremium AS adjustedHedgePremium
     FROM Orders
     WHERE OrderType = 'Hedge'
       AND Status = 'Open'
       AND OrderTaken IS NULL
       AND Denomination = ?
       AND (IsLoopOrder = 0 OR IsLoopOrder IS NULL)
       AND Coverage BETWEEN ? AND ?
     ORDER BY ABS(Coverage - ?) ASC
     LIMIT 1`,
    [denomination, low, high, targetCoverage]
  ) as [any[], unknown];

  const r = rows[0];
  if (!r) return null;

  return {
    id: r.id,
    coverage: Number(r.coverage),
    denomination: r.denomination,
    indexName: r.indexName,
    indexLevel: Number(r.indexLevel),
    indexUnit: r.indexUnit,
    payoutProbability: Number(r.payoutProbability),
    contractDuration: Number(r.contractDuration),
    adjustedHedgePremium: Number(r.adjustedHedgePremium),
  };
}

/**
 * Finds any open Yield Boost eligible order (SSTM, any coverage >= min).
 * Used for the Delta Neutral card.
 */
export async function findYieldBoostOrder(): Promise<HomePageOrderMatch | null> {
  const [rows] = await pool.query(
    `SELECT o.id, o.Coverage AS coverage, o.Denomination AS denomination,
            o.IndexName AS indexName, o.IndexLevel AS indexLevel, o.IndexUnit AS indexUnit,
            o.PayoutProbability AS payoutProbability, o.Duration AS contractDuration,
            o.AdjustedHedgePremium AS adjustedHedgePremium
     FROM Orders o
     LEFT JOIN (SELECT YieldBoostMinCoverage FROM VariableSettings ORDER BY createdAt DESC LIMIT 1) v ON 1=1
     WHERE o.OrderType = 'Hedge'
       AND o.Status = 'Open'
       AND o.OrderTaken IS NULL
       AND o.Denomination = 'SSTM'
       AND (o.IsLoopOrder = 0 OR o.IsLoopOrder IS NULL)
       AND o.Coverage >= COALESCE(v.YieldBoostMinCoverage, 2000)
     ORDER BY o.Coverage DESC
     LIMIT 1`,
    []
  ) as [any[], unknown];

  const r = rows[0];
  if (!r) return null;

  return {
    id: r.id,
    coverage: Number(r.coverage),
    denomination: r.denomination,
    indexName: r.indexName,
    indexLevel: Number(r.indexLevel),
    indexUnit: r.indexUnit,
    payoutProbability: Number(r.payoutProbability),
    contractDuration: Number(r.contractDuration),
    adjustedHedgePremium: Number(r.adjustedHedgePremium),
  };
}
