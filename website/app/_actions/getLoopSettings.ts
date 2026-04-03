'use server';

import pool from '@/lib/db';

export interface LoopSettings {
  LoopRewardAPY: number;
  LoopHedgePremiumPct: number;
  LoopFeePct: number;
  LoopLoanAPR: number;
  LoopLTV: number;
  LoopMaxLoops: number;
  LoopDefaultLoops: number;
}

const DEFAULTS: LoopSettings = {
  LoopRewardAPY: 0.17,
  LoopHedgePremiumPct: 0.01,
  LoopFeePct: 0.01,
  LoopLoanAPR: 0.075,
  LoopLTV: 0.67,
  LoopMaxLoops: 10,
  LoopDefaultLoops: 2,
};

export async function getLoopSettings(): Promise<LoopSettings> {
  try {
    const [rows] = await pool.query(
      `SELECT LoopRewardAPY, LoopHedgePremiumPct, LoopFeePct,
              LoopLoanAPR, LoopLTV, LoopMaxLoops, LoopDefaultLoops
       FROM VariableSettings
       ORDER BY createdAt DESC
       LIMIT 1`
    );
    const row = (rows as LoopSettings[])[0];
    if (!row) return DEFAULTS;
    return {
      LoopRewardAPY:       row.LoopRewardAPY       ?? DEFAULTS.LoopRewardAPY,
      LoopHedgePremiumPct: row.LoopHedgePremiumPct ?? DEFAULTS.LoopHedgePremiumPct,
      LoopFeePct:          row.LoopFeePct           ?? DEFAULTS.LoopFeePct,
      LoopLoanAPR:         row.LoopLoanAPR          ?? DEFAULTS.LoopLoanAPR,
      LoopLTV:             row.LoopLTV              ?? DEFAULTS.LoopLTV,
      LoopMaxLoops:        row.LoopMaxLoops         ?? DEFAULTS.LoopMaxLoops,
      LoopDefaultLoops:    row.LoopDefaultLoops     ?? DEFAULTS.LoopDefaultLoops,
    };
  } catch {
    return DEFAULTS;
  }
}
