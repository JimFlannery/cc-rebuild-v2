'use server';

import pool from '@/lib/db';

export interface CreateHedgeOrderInput {
  orderTiming: 'Market' | 'Committed';
  orderDuration: number | null;
  expirationDate: string | null;       // ISO timestamp
  formattedExpiration: string | null;  // 'DD Mon YYYY 11:59 PM'
  currency: 'USDC' | 'SSTM';
  contractDuration: number;
  indexName: string;                   // 'Disturbance Storm Time' | 'Planetary K-Index'
  indexLevel: number;
  indexUnit: string;
  payoutProbability: number;
  coverage: number;                    // dollar amount
  hedgePremium: number;                // base premium in token units
  hedgePremiumAdjustment: number;
  adjustedHedgePremium: number;
  serviceFee: number;
  totalServiceFees: number;
  gasFeeLayer1: number;                // SOL amount
  walletAddress: string;
  orderAddress: string;
  denominationAddress: string;
}

export async function createHedgeOrder(input: CreateHedgeOrderInput): Promise<void> {
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

  await pool.execute(
    `INSERT INTO Orders (
      OrderType, Status, StatusDate,
      OrderTiming, OrderDuration, Expiration, FormattedExpiration,
      Denomination, Duration, OracleChecks,
      IndexName, IndexLevel, IndexUnit,
      PayoutProbability, Coverage,
      HedgePremium, HedgePremiumAdjustment, AdjustedHedgePremium,
      ServiceFee, TotalServiceFees,
      GasFeeLayer1, GasFeeOracle,
      WalletAddress, OrderAddress, DenominationAddress,
      MOS, MOStype,
      createdAt, updatedAt
    ) VALUES (
      'Hedge', 'Open', ?,
      ?, ?, ?, ?,
      ?, ?, 1,
      ?, ?, ?,
      ?, ?,
      ?, ?, ?,
      ?, ?,
      ?, 0,
      ?, ?, ?,
      0, NULL,
      ?, ?
    )`,
    [
      now,
      input.orderTiming,
      input.orderDuration,
      input.expirationDate,
      input.formattedExpiration,
      input.currency,
      input.contractDuration,
      input.indexName,
      input.indexLevel,
      input.indexUnit,
      input.payoutProbability,
      input.coverage,
      input.hedgePremium,
      input.hedgePremiumAdjustment,
      input.adjustedHedgePremium,
      input.serviceFee,
      input.totalServiceFees,
      input.gasFeeLayer1,
      input.walletAddress,
      input.orderAddress,
      input.denominationAddress,
      now,
      now,
    ]
  );
}
