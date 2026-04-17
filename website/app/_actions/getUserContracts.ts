'use server';

import pool from '@/lib/db';

export interface UserContract {
  id: string;
  hedgeOrderId: string;
  coverOrderId: string;
  contractAddress: string | null;
  created: string | null;
  expiration: string | null;
  role: 'Hedge' | 'Cover';
  indexName: string;
  indexLevel: number;
  indexUnit: string;
  payoutProbability: number;
  coverage: number;
  hedgePremium: number;
  denomination: string;
  contractDuration: number;
  contractOutcome: number | null;
  status: string;
  counterparty: string | null;
  oracleChecks: number;
}

export async function getUserContracts(walletAddress: string): Promise<UserContract[]> {
  const [rows] = await pool.query(
    `SELECT
       c.id,
       c.HedgeOrderID     AS hedgeOrderId,
       c.CoverOrderID     AS coverOrderId,
       c.ContractAddress   AS contractAddress,
       c.Created           AS created,
       c.Expiration        AS expiration,
       CASE
         WHEN h.WalletAddress = ? THEN 'Hedge'
         ELSE 'Cover'
       END                 AS role,
       h.IndexName         AS indexName,
       h.IndexLevel        AS indexLevel,
       h.IndexUnit         AS indexUnit,
       h.PayoutProbability AS payoutProbability,
       h.Coverage          AS coverage,
       COALESCE(h.AdjustedHedgePremium, h.HedgePremium, 0) AS hedgePremium,
       h.Denomination      AS denomination,
       h.Duration          AS contractDuration,
       h.ContractOutcome   AS contractOutcome,
       h.Status            AS status,
       COALESCE(h.OracleChecks, 0) AS oracleChecks,
       CASE
         WHEN h.WalletAddress = ? THEN cv.WalletAddress
         ELSE h.WalletAddress
       END                 AS counterparty
     FROM Contracts c
     JOIN Orders h ON h.id = c.HedgeOrderID
     LEFT JOIN Orders cv ON cv.id = c.CoverOrderID
     WHERE h.WalletAddress = ? OR cv.WalletAddress = ?
     ORDER BY c.createdAt DESC`,
    [walletAddress, walletAddress, walletAddress, walletAddress]
  );

  return (rows as any[]).map((r) => ({
    ...r,
    indexLevel: Number(r.indexLevel),
    payoutProbability: Number(r.payoutProbability),
    coverage: Number(r.coverage),
    hedgePremium: Number(r.hedgePremium),
    contractDuration: Number(r.contractDuration),
    contractOutcome: r.contractOutcome != null ? Number(r.contractOutcome) : null,
    oracleChecks: Number(r.oracleChecks),
  }));
}
