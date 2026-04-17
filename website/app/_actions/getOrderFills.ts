'use server';

import pool from '@/lib/db';

export interface OrderFill {
  id: string;
  walletAddress: string;
  coverage: number;
  hedgePremium: number;
  createdAt: string;
  contractId: string | null;
  contractAddress: string | null;
  contractOutcome: number | null;
  oracleChecks: number;
  expiration: string | null;
}

export async function getOrderFills(hedgeOrderId: string): Promise<OrderFill[]> {
  const [rows] = await pool.query(
    `SELECT
       cv.id                   AS id,
       cv.WalletAddress        AS walletAddress,
       cv.Coverage             AS coverage,
       COALESCE(cv.AdjustedHedgePremium, cv.HedgePremium, 0) AS hedgePremium,
       cv.createdAt            AS createdAt,
       c.id                    AS contractId,
       c.ContractAddress       AS contractAddress,
       c.Expiration            AS expiration,
       COALESCE(cv.OracleChecks, 0) AS oracleChecks,
       cv.ContractOutcome      AS contractOutcome
     FROM Orders cv
     LEFT JOIN Contracts c ON c.CoverOrderID = cv.id
     WHERE cv.MatchingOrderID = ? AND cv.OrderType = 'Cover'
     ORDER BY cv.createdAt ASC`,
    [hedgeOrderId]
  );

  return (rows as any[]).map((r) => ({
    ...r,
    coverage: Number(r.coverage),
    hedgePremium: Number(r.hedgePremium),
    oracleChecks: Number(r.oracleChecks),
    contractOutcome: r.contractOutcome != null ? Number(r.contractOutcome) : null,
  }));
}
