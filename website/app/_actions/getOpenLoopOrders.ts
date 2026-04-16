'use server';

import pool from '@/lib/db';

export interface OpenLoopOrder {
  id: string;
  walletAddress: string;
  coverageUsd: number;
  numLoops: number;
  contractDuration: number;
  effectiveAPY: number;
  upfrontFeeUsd: number;
  expiration: string | null;
  formattedExpiration: string | null;
  createdAt: string;
  isCommunityOrder: boolean;
  coverageSought: number | null;
  coverageFilled: number | null;
}

export async function getOpenLoopOrders(): Promise<OpenLoopOrder[]> {
  const [rows] = await pool.query(
    `SELECT
       id,
       WalletAddress        AS walletAddress,
       Coverage             AS coverageUsd,
       LoopNumLoops         AS numLoops,
       Duration             AS contractDuration,
       CoverRewardAPY       AS effectiveAPY,
       ServiceFee           AS upfrontFeeUsd,
       Expiration           AS expiration,
       FormattedExpiration  AS formattedExpiration,
       createdAt,
       COALESCE(IsCommunityOrder, 0) AS isCommunityOrder,
       CoverageSought       AS coverageSought,
       CoverageFilled       AS coverageFilled
     FROM Orders
     WHERE IsLoopOrder = 1
       AND Status = 'Open'
       AND (OrderTaken = 0 OR OrderTaken IS NULL)
       AND (Expiration IS NULL OR Expiration > NOW())
     ORDER BY createdAt DESC`
  );
  return (rows as any[]).map((r) => ({
    ...r,
    isCommunityOrder: !!r.isCommunityOrder,
    coverageSought: r.coverageSought != null ? Number(r.coverageSought) : null,
    coverageFilled: r.coverageFilled != null ? Number(r.coverageFilled) : null,
  }));
}
