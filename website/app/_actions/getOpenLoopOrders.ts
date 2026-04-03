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
       createdAt
     FROM Orders
     WHERE IsLoopOrder = 1
       AND Status = 'Open'
       AND (OrderTaken = 0 OR OrderTaken IS NULL)
       AND (Expiration IS NULL OR Expiration > NOW())
     ORDER BY createdAt DESC`
  );
  return rows as OpenLoopOrder[];
}
