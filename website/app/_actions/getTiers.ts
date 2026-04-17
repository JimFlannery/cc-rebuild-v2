'use server';

import pool from '@/lib/db';

export interface Tier {
  Tier: number;
  Name: string;
  TotalStart: number;
  TotalLessThan: number | null;
  APY: number;
  LoopLoanAPR: number | null;
  USDCserviceFee: number;
  SSTMserviceFee: number;
}

export async function getTiers(): Promise<Tier[]> {
  const [rows] = await pool.query(
    'SELECT Tier, Name, TotalStart, TotalLessThan, APY, LoopLoanAPR, USDCserviceFee, SSTMserviceFee FROM Tiers ORDER BY Tier ASC'
  );
  return rows as Tier[];
}

