'use server';

import pool from '@/lib/db';

export interface ContractDetail {
  id: string;
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
  oracleChecks: number;
  hedgeOrderId: string;
  coverOrderId: string;
  hedgeWallet: string;
  coverWallet: string | null;
  myWallet: string;
  counterpartyWallet: string | null;
  hedgeOrderAddress: string | null;
  coverOrderAddress: string | null;
  denominationAddress: string | null;
}

export async function getContractById(
  id: string,
  walletAddress: string
): Promise<ContractDetail | null> {
  const [rows] = await pool.query(
    `SELECT
       c.id                 AS id,
       c.ContractAddress    AS contractAddress,
       c.Created            AS created,
       c.Expiration         AS expiration,
       c.HedgeOrderID       AS hedgeOrderId,
       c.CoverOrderID       AS coverOrderId,
       h.IndexName          AS indexName,
       h.IndexLevel         AS indexLevel,
       h.IndexUnit          AS indexUnit,
       h.PayoutProbability  AS payoutProbability,
       h.Coverage           AS coverage,
       COALESCE(h.AdjustedHedgePremium, h.HedgePremium, 0) AS hedgePremium,
       h.Denomination       AS denomination,
       h.Duration           AS contractDuration,
       h.ContractOutcome    AS contractOutcome,
       h.Status             AS status,
       COALESCE(h.OracleChecks, 0) AS oracleChecks,
       h.WalletAddress      AS hedgeWallet,
       cv.WalletAddress     AS coverWallet,
       h.OrderAddress       AS hedgeOrderAddress,
       cv.OrderAddress      AS coverOrderAddress,
       h.DenominationAddress AS denominationAddress
     FROM Contracts c
     JOIN Orders h ON h.id = c.HedgeOrderID
     LEFT JOIN Orders cv ON cv.id = c.CoverOrderID
     WHERE c.id = ?
       AND (h.WalletAddress = ? OR cv.WalletAddress = ?)`,
    [id, walletAddress, walletAddress]
  );

  const r = (rows as any[])[0];
  if (!r) return null;

  const role: 'Hedge' | 'Cover' = r.hedgeWallet === walletAddress ? 'Hedge' : 'Cover';
  const counterpartyWallet = role === 'Hedge' ? r.coverWallet : r.hedgeWallet;

  return {
    ...r,
    role,
    myWallet: walletAddress,
    counterpartyWallet,
    indexLevel: Number(r.indexLevel),
    payoutProbability: Number(r.payoutProbability),
    coverage: Number(r.coverage),
    hedgePremium: Number(r.hedgePremium),
    contractDuration: Number(r.contractDuration),
    contractOutcome: r.contractOutcome != null ? Number(r.contractOutcome) : null,
    oracleChecks: Number(r.oracleChecks),
  };
}
