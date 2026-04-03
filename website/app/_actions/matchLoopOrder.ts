'use server';

import pool from '@/lib/db';

export interface MatchLoopOrderInput {
  seedOrderId: string;        // The open loop order being matched
  matcherWalletAddress: string;
  loopSetAddress: string;     // LoopSet PDA (from on-chain tx)
  contractAAddress: string;   // A-contract PDA (User1 Cover ↔ User2 Hedge)
  contractBAddress: string;   // B-contract PDA (User2 Cover ↔ User1 Hedge)
  numLoops: number;
  coverageUsd: number;
  contractDuration: number;
  effectiveAPY: number;
  upfrontFeeUsd: number;
  totalCoverUsd: number;
  totalLoansUsd: number;
  totalInterestUsd: number;
}

export async function matchLoopOrder(input: MatchLoopOrderInput): Promise<void> {
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 1. Mark the seed order as Matched and link the LoopSet address.
    await conn.execute(
      `UPDATE Orders
       SET Status = 'Matched',
           StatusDate = ?,
           OrderTaken = 1,
           LoopSetID = ?,
           updatedAt = ?
       WHERE id = ? AND IsLoopOrder = 1 AND Status = 'Open'`,
      [now, input.loopSetAddress, now, input.seedOrderId]
    );

    // 2. Create a LoopSets record to track the full set.
    // Rates are snapshotted from the seed order's stored values.
    await conn.execute(
      `INSERT INTO LoopSets (
         User1ID, User2ID,
         Status,
         InitialCover, NumLoops,
         TotalCoverDeployed, TotalLoansIssued, TotalInterestOwed, TotalFeesCollected,
         RewardAPY, FeePct,
         id, createdAt, updatedAt
       ) VALUES (
         (SELECT WalletAddress FROM Orders WHERE id = ?),
         ?,
         'Active',
         ?, ?,
         ?, ?, ?, ?,
         ?, 0.01,
         ?, ?, ?
       )`,
      [
        input.seedOrderId,
        input.matcherWalletAddress,
        input.coverageUsd,
        input.numLoops,
        input.totalCoverUsd,
        input.totalLoansUsd,
        input.totalInterestUsd,
        input.upfrontFeeUsd,
        input.effectiveAPY,
        input.loopSetAddress,  // use on-chain PDA as the DB id for easy cross-referencing
        now,
        now,
      ]
    );

    // 3. Record the two initial contract pairs as LoopNumber=0 orders,
    //    linked back to the LoopSet.
    const contractPairs = [
      { address: input.contractAAddress, role: 'Cover' as const },
      { address: input.contractBAddress, role: 'Hedge' as const },
    ];
    for (const pair of contractPairs) {
      await conn.execute(
        `INSERT INTO Orders (
           OrderType, Status, StatusDate,
           Denomination, Duration, OracleChecks,
           IndexName, IndexLevel, IndexUnit, PayoutProbability,
           Coverage, CoverRewardAPY,
           WalletAddress, OrderAddress,
           IsLoopOrder, LoopSetID, LoopNumber,
           MOS, MOStype,
           createdAt, updatedAt
         ) VALUES (
           ?, 'Matched', ?,
           'SSTM', ?, 1,
           'Disturbance Storm Time', -850, 'nT', 0.012,
           ?, ?,
           ?, ?,
           1, ?, 0,
           0, NULL,
           ?, ?
         )`,
        [
          pair.role,
          now,
          input.contractDuration,
          input.coverageUsd,
          input.effectiveAPY,
          pair.role === 'Cover' ? input.matcherWalletAddress : '',
          pair.address,
          input.loopSetAddress,
          now,
          now,
        ]
      );
    }

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}
