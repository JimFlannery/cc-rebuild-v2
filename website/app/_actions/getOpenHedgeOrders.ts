'use server';

import pool from '@/lib/db';

export interface OpenHedgeOrder {
  id: string;
  walletAddress: string;
  indexName: string;
  indexLevel: number;
  indexUnit: string;
  payoutProbability: number;
  coverage: number;
  hedgePremium: number;
  adjustedHedgePremium: number;
  denomination: string;
  contractDuration: number;
  expiration: string | null;
  formattedExpiration: string | null;
  coverRewardAPY: number | null;
  yieldBoostEligible: boolean;
  createdAt: string;
}

export interface HedgeOrderFilters {
  indexName?: string;
  denomination?: string;
  minCoverage?: number;
  maxCoverage?: number;
  minProbability?: number;
  maxProbability?: number;
  minDuration?: number;
  maxDuration?: number;
}

export interface OpenHedgeOrdersResult {
  orders: OpenHedgeOrder[];
  totalCount: number;
  spaceWeatherCount: number;
}

export async function getOpenHedgeOrders(
  filters: HedgeOrderFilters = {}
): Promise<OpenHedgeOrdersResult> {
  // Base condition: standard open hedge orders only (no loop orders)
  const conditions: string[] = [
    "OrderType = 'Hedge'",
    "Status = 'Open'",
    "(IsLoopOrder = 0 OR IsLoopOrder IS NULL)",
    "(OrderTaken = 0 OR OrderTaken IS NULL)",
    "(Expiration IS NULL OR Expiration > NOW())",
  ];
  const params: (string | number)[] = [];

  if (filters.indexName) {
    conditions.push("IndexName = ?");
    params.push(filters.indexName);
  }
  if (filters.denomination) {
    conditions.push("Denomination = ?");
    params.push(filters.denomination);
  }
  if (filters.minCoverage !== undefined) {
    conditions.push("Coverage >= ?");
    params.push(filters.minCoverage);
  }
  if (filters.maxCoverage !== undefined) {
    conditions.push("Coverage <= ?");
    params.push(filters.maxCoverage);
  }
  if (filters.minProbability !== undefined) {
    conditions.push("PayoutProbability >= ?");
    params.push(filters.minProbability);
  }
  if (filters.maxProbability !== undefined) {
    conditions.push("PayoutProbability <= ?");
    params.push(filters.maxProbability);
  }
  if (filters.minDuration !== undefined) {
    conditions.push("Duration >= ?");
    params.push(filters.minDuration);
  }
  if (filters.maxDuration !== undefined) {
    conditions.push("Duration <= ?");
    params.push(filters.maxDuration);
  }

  const where = conditions.join(" AND ");

  // Fetch orders + yield boost threshold in one query
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
       o.createdAt,
       COALESCE(v.YieldBoostMinCoverage, 2000) AS yieldBoostMin
     FROM Orders o
     LEFT JOIN (SELECT YieldBoostMinCoverage FROM VariableSettings ORDER BY createdAt DESC LIMIT 1) v ON 1=1
     WHERE ${where}
     ORDER BY o.createdAt DESC`,
    params
  ) as [any[], unknown];

  const orders: OpenHedgeOrder[] = (rows as any[]).map((r) => ({
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
  }));

  // Count by category (space weather = all current indices)
  const spaceWeatherIndices = [
    'Disturbance Storm Time', 'Planetary K-Index',
    'Solar X-Ray Flux', 'Solar Proton Flux', 'Solar Radio Flux',
  ];
  const spaceWeatherCount = orders.filter((o) =>
    spaceWeatherIndices.some((i) => o.indexName.includes(i.split(' ')[0]))
  ).length;

  return { orders, totalCount: orders.length, spaceWeatherCount };
}
