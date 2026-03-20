import { config } from '../config';
import type { IndexReading } from './types';

// Row layout after the header: [time_tag, dst]
type DstRow = [string, number];

/**
 * Fetch the most recent hourly Dst index from NOAA SWPC (Kyoto data, served as JSON).
 *
 * Source:  products/kyoto-dst.json  (updates hourly)
 * Format:  Array of arrays; first row is the header.
 * Value:   Dst at index [1] in nT (nanotesla). Negative = stronger storm.
 *
 * Storm severity (approximate):
 *   Quiet:    Dst > -25 nT
 *   Minor:    -25 to -50 nT
 *   Moderate: -50 to -100 nT
 *   Intense:  -100 to -250 nT
 *   Severe:   < -250 nT
 *
 * Contracts store IndexLevel as a negative nT threshold.
 * Trigger condition: current Dst ≤ IndexLevel (more negative than threshold).
 */
export async function fetchDst(): Promise<IndexReading> {
  const url = `${config.noaa.baseUrl}/products/kyoto-dst.json`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`NOAA Dst fetch failed: ${res.status} ${res.statusText}`);
  }

  const rows: DstRow[] = await res.json();
  if (rows.length < 2) throw new Error('NOAA Dst: no data rows (only header)');

  // Row 0 is the header ["time_tag", "dst"]; last row is most recent.
  const latest = rows[rows.length - 1];
  const value = Number(latest[1]);
  if (isNaN(value)) {
    throw new Error(`NOAA Dst: could not parse value from row: ${JSON.stringify(latest)}`);
  }

  return {
    indexName: 'Dst',
    value,
    timeTag: latest[0],
  };
}
