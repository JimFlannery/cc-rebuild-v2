'use server';

import pool from '@/lib/db';
import { getTokenPrices } from './prices';

export interface CreateCoverOrderInput {
  orderTiming: 'Market' | 'Committed';
  orderDuration: number | null;
  expirationDate: string | null;
  formattedExpiration: string | null;
  currency: 'USDC' | 'SSTM';
  contractDuration: number;
  indexName: string;
  indexLevel: number;
  indexUnit: string;
  payoutProbability: number;
  coverage: number;
  hedgePremium: number;
  hedgePremiumAdjustment: number;
  adjustedHedgePremium: number;
  serviceFee: number;
  totalServiceFees: number;
  gasFeeLayer1: number;
  walletAddress: string;
  orderAddress: string;
  denominationAddress: string;
  matchingOrderID?: string;        // the hedge order being covered
}

export async function createCoverOrder(input: CreateCoverOrderInput): Promise<void> {
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const prices = await getTokenPrices();

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
      SSTMPriceAtCreation,
      MatchingOrderID,
      MOS, MOStype,
      createdAt, updatedAt
    ) VALUES (
      'Cover', 'Open', ?,
      ?, ?, ?, ?,
      ?, ?, 1,
      ?, ?, ?,
      ?, ?,
      ?, ?, ?,
      ?, ?,
      ?, 0,
      ?, ?, ?,
      ?,
      ?,
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
      prices.SSTM,
      input.matchingOrderID ?? null,
      now,
      now,
    ]
  );
}
