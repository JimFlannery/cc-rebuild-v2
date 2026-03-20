import mysql from 'mysql2/promise';
import { config } from '../config';
import type { IndexName } from '../adapter/types';

/** A contract row from MySQL that the oracle needs to evaluate. */
export interface ActiveContract {
  /** UUID of the matched Hedge order (Orders.OrderID) */
  hedgeOrderId: string;
  /** UUID of the matched Cover order (Orders.OrderID) */
  coverOrderId: string;
  /** Solana pubkey of the deployed contract program account */
  contractAddress: string;
  /** Token destination for the Hedge party on settlement */
  hedgeAddress: string;
  /** Token destination for the Cover party on settlement */
  coverAddress: string;
  /** The index being monitored */
  indexName: IndexName;
  /**
   * The threshold value.
   * - Kp: decimal ≥ threshold triggers payout
   * - Dst: nT ≤ threshold (more negative) triggers payout
   * - X-Ray/Proton/F10.7: value ≥ threshold triggers payout
   */
  indexLevel: number;
  /** Contract expiration as a JS Date */
  expiration: Date;
  /** How many times the oracle has already checked this contract */
  oracleChecks: number;
}

let pool: mysql.Pool | undefined;

function getPool(): mysql.Pool {
  if (!pool) {
    pool = mysql.createPool({
      host: config.db.host,
      port: config.db.port,
      database: config.db.database,
      user: config.db.user,
      password: config.db.password,
      waitForConnections: true,
      connectionLimit: 5,
    });
  }
  return pool;
}

/**
 * Query MySQL for all active contracts watching a given index.
 *
 * "Active" means:
 *   - The order is of type Hedge AND has a matching Cover order (Contracts row exists)
 *   - ContractExpiration is in the future
 *   - ContractOutcome is NULL (not yet settled)
 *
 * We join Orders (twice) and Contracts to get the full picture.
 */
export async function getActiveContracts(indexName: IndexName): Promise<ActiveContract[]> {
  const db = getPool();

  const [rows] = await db.execute<mysql.RowDataPacket[]>(
    `SELECT
       c.HedgeOrderID      AS hedgeOrderId,
       c.CoverOrderID      AS coverOrderId,
       c.ContractAddress   AS contractAddress,
       c.HedgeAddress      AS hedgeAddress,
       c.CoverAddress      AS coverAddress,
       h.IndexName         AS indexName,
       h.IndexLevel        AS indexLevel,
       h.ContractExpiration AS expiration,
       h.OracleChecks      AS oracleChecks
     FROM Contracts c
     JOIN Orders h ON h.OrderID = c.HedgeOrderID
     WHERE h.IndexName = ?
       AND h.ContractExpiration > NOW()
       AND c.ContractOutcome IS NULL`,
    [indexName],
  );

  return rows.map(r => ({
    hedgeOrderId: r.hedgeOrderId as string,
    coverOrderId: r.coverOrderId as string,
    contractAddress: r.contractAddress as string,
    hedgeAddress: r.hedgeAddress as string,
    coverAddress: r.coverAddress as string,
    indexName: r.indexName as IndexName,
    indexLevel: parseFloat(r.indexLevel),
    expiration: new Date(r.expiration),
    oracleChecks: parseInt(r.oracleChecks, 10),
  }));
}

/**
 * Query MySQL for contracts that have expired without being settled.
 * The oracle calls this to finalize outcome=0 (Cover party wins).
 */
export async function getExpiredUnsettledContracts(indexName: IndexName): Promise<ActiveContract[]> {
  const db = getPool();

  const [rows] = await db.execute<mysql.RowDataPacket[]>(
    `SELECT
       c.HedgeOrderID      AS hedgeOrderId,
       c.CoverOrderID      AS coverOrderId,
       c.ContractAddress   AS contractAddress,
       c.HedgeAddress      AS hedgeAddress,
       c.CoverAddress      AS coverAddress,
       h.IndexName         AS indexName,
       h.IndexLevel        AS indexLevel,
       h.ContractExpiration AS expiration,
       h.OracleChecks      AS oracleChecks
     FROM Contracts c
     JOIN Orders h ON h.OrderID = c.HedgeOrderID
     WHERE h.IndexName = ?
       AND h.ContractExpiration <= NOW()
       AND c.ContractOutcome IS NULL`,
    [indexName],
  );

  return rows.map(r => ({
    hedgeOrderId: r.hedgeOrderId as string,
    coverOrderId: r.coverOrderId as string,
    contractAddress: r.contractAddress as string,
    hedgeAddress: r.hedgeAddress as string,
    coverAddress: r.coverAddress as string,
    indexName: r.indexName as IndexName,
    indexLevel: parseFloat(r.indexLevel),
    expiration: new Date(r.expiration),
    oracleChecks: parseInt(r.oracleChecks, 10),
  }));
}

/**
 * Increment OracleChecks on both the Hedge and Cover orders after each poll.
 */
export async function incrementOracleChecks(contract: ActiveContract): Promise<void> {
  const db = getPool();
  await db.execute(
    `UPDATE Orders SET OracleChecks = OracleChecks + 1, updatedAt = NOW()
     WHERE OrderID IN (?, ?)`,
    [contract.hedgeOrderId, contract.coverOrderId],
  );
}

/**
 * Record the settlement outcome in MySQL after the on-chain transaction confirms.
 * outcome: 1 = Hedge wins (event occurred), 0 = Cover wins (expired without event).
 */
export async function recordSettlement(
  contract: ActiveContract,
  outcome: 0 | 1,
  txSignature: string,
): Promise<void> {
  const db = getPool();
  await db.execute(
    `UPDATE Contracts
     SET ContractOutcome = ?,
         updatedAt = NOW()
     WHERE HedgeOrderID = ?`,
    [outcome, contract.hedgeOrderId],
  );

  // Mark both orders as Settled
  await db.execute(
    `UPDATE Orders
     SET Status = 'Settled', updatedAt = NOW()
     WHERE OrderID IN (?, ?)`,
    [contract.hedgeOrderId, contract.coverOrderId],
  );

  console.log(
    `[DB] Settled contract ${contract.contractAddress} | outcome=${outcome} | tx=${txSignature}`,
  );
}

/** Close the connection pool (call on graceful shutdown). */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}
