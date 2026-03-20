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
 */
export interface IndexReading {
  indexName: IndexName;
  /** Numeric value to compare against the contract's IndexLevel threshold. */
  value: number;
  /** ISO 8601 UTC timestamp of the measurement. */
  timeTag: string;
}
