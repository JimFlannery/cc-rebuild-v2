// Payout condition definitions for Hedge orders.
// indexLevelOdds = annual probability (0–1) that the threshold is crossed.
// Kp values are expressed as days/year ÷ 365.

export interface PayoutCondition {
  label: string;
  indexName: "Dst" | "Kp";
  indexLevel: number;       // human-readable (e.g. -400, 6)
  indexUnit: string;        // 'nT' | 'Kp'
  indexLevelEncoded: number; // fixed-point ×100 for on-chain i64
  indexLevelOdds: number;   // annual probability (0–1)
}

export const PAYOUT_CONDITIONS: Record<string, PayoutCondition> = {
  dst_neg400: {
    label: "Dst < -400 nT",
    indexName: "Dst",
    indexLevel: -400,
    indexUnit: "nT",
    indexLevelEncoded: -40000,
    indexLevelOdds: 0.05,
  },
  dst_neg600: {
    label: "Dst < -600 nT",
    indexName: "Dst",
    indexLevel: -600,
    indexUnit: "nT",
    indexLevelEncoded: -60000,
    indexLevelOdds: 0.0167,
  },
  dst_neg850: {
    label: "Dst < -850 nT",
    indexName: "Dst",
    indexLevel: -850,
    indexUnit: "nT",
    indexLevelEncoded: -85000,
    indexLevelOdds: 0.012,
  },
  kp_6: {
    label: "Kp ≥ 6",
    indexName: "Kp",
    indexLevel: 6,
    indexUnit: "Kp",
    indexLevelEncoded: 600,
    indexLevelOdds: 154.54 / 365,
  },
  kp_7: {
    label: "Kp ≥ 7",
    indexName: "Kp",
    indexLevel: 7,
    indexUnit: "Kp",
    indexLevelEncoded: 700,
    indexLevelOdds: 54.54 / 365,
  },
  kp_8: {
    label: "Kp ≥ 8",
    indexName: "Kp",
    indexLevel: 8,
    indexUnit: "Kp",
    indexLevelEncoded: 800,
    indexLevelOdds: 9.09 / 365,
  },
  kp_9: {
    label: "Kp ≥ 9",
    indexName: "Kp",
    indexLevel: 9,
    indexUnit: "Kp",
    indexLevelEncoded: 900,
    indexLevelOdds: 0.3636 / 365,
  },
};

export const DST_CONDITIONS = Object.entries(PAYOUT_CONDITIONS)
  .filter(([, v]) => v.indexName === "Dst")
  .map(([key, v]) => ({ key, ...v }));

export const KP_CONDITIONS = Object.entries(PAYOUT_CONDITIONS)
  .filter(([, v]) => v.indexName === "Kp")
  .map(([key, v]) => ({ key, ...v }));

// Anchor enum variants for index names
export const INDEX_NAME_TO_ANCHOR = {
  Dst: { dst: {} },
  Kp: { kp: {} },
} as const;

// SPL token mints.
// SSTM: placeholder until the token is deployed on devnet/mainnet.
export const MINT_ADDRESSES = {
  USDC: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  SSTM: "SSTMxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx", // TODO: replace with actual mint
} as const;

export const TOKEN_DECIMALS = 6;

export const PROGRAM_ID = "5PkPCbdZNFGYVJNjifxgZDGyeaMKmTeWPj4fxhYeeB9K";

export const CONTRACT_DURATIONS = [2, 4, 6, 8, 10, 30, 60, 90, 180, 365];

/** Find the matching service-fee tier for a given coverage dollar amount. */
export function matchTier<T extends { TotalStart: number; TotalLessThan: number | null }>(
  tiers: T[],
  coverageUsd: number
): T | undefined {
  return tiers.find(
    (t) =>
      coverageUsd >= t.TotalStart &&
      (t.TotalLessThan === null || coverageUsd < t.TotalLessThan)
  );
}
