'use server';

import pool from '@/lib/db';
import type { OpenLoopOrder } from './getOpenLoopOrders';

export interface LoopOrderDetail extends OpenLoopOrder {
  status: string;
  orderTaken: boolean;
}

export async function getLoopOrderById(id: string): Promise<LoopOrderDetail | null> {
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
       CoverageFilled       AS coverageFilled,
       Status               AS status,
       COALESCE(OrderTaken, 0) AS orderTaken
     FROM Orders
     WHERE id = ? AND IsLoopOrder = 1`,
    [id]
  );

  const r = (rows as any[])[0];
  if (!r) return null;

  return {
    ...r,
    coverageUsd: Number(r.coverageUsd),
    numLoops: Number(r.numLoops),
    contractDuration: Number(r.contractDuration),
    effectiveAPY: r.effectiveAPY != null ? Number(r.effectiveAPY) : 0,
    upfrontFeeUsd: r.upfrontFeeUsd != null ? Number(r.upfrontFeeUsd) : 0,
    isCommunityOrder: !!r.isCommunityOrder,
    coverageSought: r.coverageSought != null ? Number(r.coverageSought) : null,
    coverageFilled: r.coverageFilled != null ? Number(r.coverageFilled) : null,
    orderTaken: !!r.orderTaken,
  };
}
