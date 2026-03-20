import { config } from '../config';
import type { IndexReading } from './types';

interface KpRecord {
  time_tag: string;
  kp_index: number;
  estimated_kp: number;
  /** Alphanumeric Kp code, e.g. "3P". Suffix: Z = lower, M = middle, P = plus/upper third. */
  kp: string;
}

/**
 * Fetch the most recent planetary Kp-Index from NOAA SWPC.
 *
 * Source:  json/planetary_k_index_1m.json  (updates every minute)
 * Returns: estimated_kp — decimal precision Kp (e.g. 3.33 for "3P").
 *
 * Kp ≥ 5 → geomagnetic storm (G1+).
 * Contracts store IndexLevel as the integer or decimal Kp threshold.
 */
export async function fetchKp(): Promise<IndexReading> {
  const url = `${config.noaa.baseUrl}/json/planetary_k_index_1m.json`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`NOAA Kp fetch failed: ${res.status} ${res.statusText}`);
  }

  const records: KpRecord[] = await res.json();
  if (!records.length) throw new Error('NOAA Kp: empty response');

  // Records are chronological; the last entry is the most recent minute.
  const latest = records[records.length - 1];

  return {
    indexName: 'Kp',
    value: latest.estimated_kp,
    timeTag: latest.time_tag,
  };
}
