import { config } from '../config';
import type { IndexReading } from './types';

interface F107Record {
  time_tag: string;
  frequency: number;
  /** F10.7 flux in solar flux units (sfu). 1 sfu = 10⁻²² W m⁻² Hz⁻¹. */
  flux: number;
  reporting_schedule: 'Morning' | 'Noon' | 'Afternoon';
  avg_begin_date: string | null;
  ninety_day_mean: number | null;
  rec_count: number | null;
}

/**
 * Fetch the most recent F10.7 solar radio flux from NOAA SWPC.
 *
 * Source:  json/f107_cm_flux.json  (published 3× per day: Morning, Noon, Afternoon)
 * Unit:    sfu (solar flux units); measured at 10.7 cm / 2800 MHz by NRC Ottawa.
 *
 * Reference levels:
 *   Quiet sun:  70–80 sfu
 *   Moderate:   100–150 sfu
 *   Active:     150–300+ sfu
 *
 * NOTE: Records in this file are ordered most-recent-first.
 * Contracts store IndexLevel as the sfu threshold.
 */
export async function fetchF107(): Promise<IndexReading> {
  const url = `${config.noaa.baseUrl}/json/f107_cm_flux.json`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`NOAA F10.7 fetch failed: ${res.status} ${res.statusText}`);
  }

  const records = (await res.json()) as F107Record[];
  if (!records.length) throw new Error('NOAA F10.7: empty response');

  // Unlike other NOAA files, f107_cm_flux.json is newest-first.
  const latest = records[0];

  return {
    indexName: 'Solar Radio Flux',
    value: latest.flux,
    timeTag: latest.time_tag,
  };
}
