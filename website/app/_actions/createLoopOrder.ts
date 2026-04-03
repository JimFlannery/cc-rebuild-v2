'use server';

import pool from '@/lib/db';

export interface CreateLoopOrderInput {
  coverageUsd: number;
  numLoops: number;
  contractDuration: number;
  orderDuration: number | null;      // hours until order expires
  expirationDate: string | null;     // ISO timestamp
  formattedExpiration: string | null;
  walletAddress: string;
  // Financials stored for the marketplace display
  effectiveAPY: number;
  leverage: number;
  totalCoverUsd: number;
  upfrontFeeUsd: number;
}

export async function createLoopOrder(input: CreateLoopOrderInput): Promise<{ id: string }> {
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

  const [result] = await pool.execute(
    `INSERT INTO Orders (
      OrderType, Status, StatusDate,
      OrderTiming, OrderDuration, Expiration, FormattedExpiration,
      Denomination, Duration, OracleChecks,
      IndexName, IndexLevel, IndexUnit, PayoutProbability,
      Coverage, CoverRewardAPY,
      ServiceFee, TotalServiceFees,
      WalletAddress,
      IsLoopOrder, LoopNumLoops,
      MOS, MOStype,
      createdAt, updatedAt
    ) VALUES (
      'Cover', 'Open', ?,
      'Committed', ?, ?, ?,
      'SSTM', ?, 1,
      'Disturbance Storm Time', -850, 'nT', 0.012,
      ?, ?,
      ?, ?,
      ?,
      1, ?,
      0, NULL,
      ?, ?
    )`,
    [
      now,
      input.orderDuration,
      input.expirationDate,
      input.formattedExpiration,
      input.contractDuration,
      input.coverageUsd,
      input.effectiveAPY,
      input.upfrontFeeUsd,
      input.upfrontFeeUsd,
      input.walletAddress,
      input.numLoops,
      now,
      now,
    ]
  );

  const insertResult = result as { insertId: number };
  // Return the UUID that MySQL auto-assigned
  const [rows] = await pool.query(
    'SELECT id FROM Orders WHERE id = LAST_INSERT_ID() OR (WalletAddress = ? AND createdAt = ? AND IsLoopOrder = 1) ORDER BY createdAt DESC LIMIT 1',
    [input.walletAddress, now]
  );
  const id = ((rows as { id: string }[])[0]?.id) ?? String(insertResult.insertId);
  return { id };
}
