import { config } from '../config';
import type { IndexReading } from './types';

interface ProtonRecord {
  time_tag: string;
  satellite: number;
  /** Integral proton flux in particles/(cm² s sr) — commonly reported as pfu. */
  flux: number;
  /** Energy threshold channel, e.g. ">=10 MeV". */
  energy: string;
}

// S-scale radiation storm rating is defined on the ≥10 MeV channel.
const ENERGY_CHANNEL = '>=10 MeV';

/**
 * Fetch the most recent GOES integral proton flux from NOAA SWPC.
 *
 * Source:  json/goes/primary/integral-protons-1-day.json  (updates every 5 min)
 * Channel: ≥10 MeV, flux in pfu (particles flux unit).
 *
 * S-scale thresholds (pfu):
 *   S1 ≥ 10   S2 ≥ 100   S3 ≥ 1,000   S4 ≥ 10,000   S5 ≥ 100,000
 *
 * Contracts store IndexLevel as the pfu threshold.
 */
export async function fetchProton(): Promise<IndexReading> {
  const url = `${config.noaa.baseUrl}/json/goes/primary/integral-protons-1-day.json`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`NOAA proton fetch failed: ${res.status} ${res.statusText}`);
  }

  const records = (await res.json()) as ProtonRecord[];
  if (!records.length) throw new Error('NOAA proton: empty response');

  const channel = records.filter(r => r.energy === ENERGY_CHANNEL);
  if (!channel.length) {
    throw new Error(`NOAA proton: no ${ENERGY_CHANNEL} channel records`);
  }

  // Records are chronological; last is most recent.
  const latest = channel[channel.length - 1];

  return {
    indexName: 'Solar Proton Flux',
    value: latest.flux,
    timeTag: latest.time_tag,
  };
}
