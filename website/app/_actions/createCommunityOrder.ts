'use server';

import pool from '@/lib/db';
import { getTokenPrices } from './prices';

export interface CreateCommunityOrderInput {
  coverageSoughtUsd: number;   // total coverage the pool is seeking
  contractDuration: number;    // days
  orderDuration: number;       // days until order expires
}

/**
 * Creates a community Yield Boost order — a pool-based order that accepts
 * contributions from multiple participants up to CoverageSought.
 *
 * The order closes when either CoverageFilled >= CoverageSought or the
 * order duration expires, whichever comes first.
 */
export async function createCommunityOrder(input: CreateCommunityOrderInput): Promise<{ id: string }> {
  const now = new Date();
  const nowStr = now.toISOString().slice(0, 19).replace('T', ' ');

  const expiresAt = new Date(now.getTime() + input.orderDuration * 24 * 3_600_000);
  const expirationStr = expiresAt.toISOString().slice(0, 19).replace('T', ' ');

  const prices = await getTokenPrices();
  const sstmPrice = prices.SSTM;

  const [result] = await pool.execute(
    `INSERT INTO Orders (
      OrderType, Status, StatusDate,
      OrderTiming, OrderDuration, Expiration,
      Denomination, Duration, OracleChecks,
      IndexName, IndexLevel, IndexUnit, PayoutProbability,
      Coverage, CoverageSought, CoverageFilled,
      SSTMPriceAtCreation,
      IsLoopOrder, IsCommunityOrder,
      MOS, MOStype,
      createdAt, updatedAt
    ) VALUES (
      'Cover', 'Open', ?,
      'Committed', ?, ?,
      'SSTM', ?, 1,
      'Disturbance Storm Time', -850, 'nT', 0.012,
      0, ?, 0,
      ?,
      1, 1,
      0, NULL,
      ?, ?
    )`,
    [
      nowStr,
      input.orderDuration * 24,            // stored in hours
      expirationStr,
      input.contractDuration,
      input.coverageSoughtUsd,
      sstmPrice,
      nowStr,
      nowStr,
    ]
  );

  const [rows] = await pool.query(
    `SELECT id FROM Orders
     WHERE IsCommunityOrder = 1 AND createdAt = ?
     ORDER BY createdAt DESC LIMIT 1`,
    [nowStr]
  );
  const id = ((rows as { id: string }[])[0]?.id) ?? '';
  return { id };
}
