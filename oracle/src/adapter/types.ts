/**
 * The set of index names as stored in MySQL Orders.IndexName.
 * Must match exactly — the oracle queries on this string.
 */
export type IndexName =
  | 'Kp'
  | 'Dst'
  | 'Solar X-Ray Flux'
  | 'Solar Proton Flux'
  | 'Solar Radio Flux';

/**
 * A single reading from any index data source.
 * The oracle compares `value` against each contract's `IndexLevel`.
 *
 * Note on units: NOAA adapters return natural float values (e.g. Kp 5.0,
 * Dst -120 nT).  The on-chain program stores IndexLevel as fixed-point ×100
 * (Kp 5.0 → 500, Dst -120 → -12000).  The threshold comparison in index.ts
 * decodes the stored value before comparing — adapters do NOT need to scale.
 */
export interface IndexReading {
  indexName: IndexName;
  /** Numeric value to compare against the contract's IndexLevel threshold. */
  value: number;
  /** ISO 8601 UTC timestamp of the measurement. */
  timeTag: string;
}

/**
 * Maps MySQL/oracle IndexName strings to the Anchor enum variant objects
 * used when calling `create_order` on the Solana program.
 *
 * Usage (website / TypeScript client):
 *   program.methods.createOrder(nonce, INDEX_NAME_TO_ANCHOR['Kp'], ...)
 *
 * The on-chain Rust enum is:
 *   Kp | Dst | SolarXRayFlux | SolarProtonFlux | SolarRadioFlux
 *
 * Anchor serialises these as `{ kp: {} }`, `{ dst: {} }`, etc.
 */
export const INDEX_NAME_TO_ANCHOR: Record<IndexName, object> = {
  'Kp':               { kp: {} },
  'Dst':              { dst: {} },
  'Solar X-Ray Flux': { solarXRayFlux: {} },
  'Solar Proton Flux':{ solarProtonFlux: {} },
  'Solar Radio Flux': { solarRadioFlux: {} },
};
