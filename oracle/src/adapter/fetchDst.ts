import { config } from '../config';
import type { IndexReading } from './types';

/**
 * Fetch the most recent Dst (Disturbance Storm Time) index from the
 * Kyoto World Data Center for Geomagnetism.
 *
 * Source:  Kyoto WDC realtime HTML page (hourly, ~1-hour lag)
 * Unit:    nT (nanotesla). Negative values indicate stronger storms.
 *
 * Storm severity (approximate):
 *   Quiet:    Dst > -25 nT
 *   Minor:    -25 to -50 nT
 *   Moderate: -50 to -100 nT
 *   Intense:  -100 to -250 nT
 *   Severe:   < -250 nT
 *
 * Contracts store IndexLevel as a negative nT threshold.
 * Trigger condition: current Dst ≤ IndexLevel  (i.e. more negative than threshold).
 *
 * NOTE: NOAA SWPC does not publish a Dst JSON feed. This is the authoritative
 * realtime source. The Kyoto HTML format has been stable since the 1990s.
 */
export async function fetchDst(): Promise<IndexReading> {
  const url = config.kyoto.dstUrl;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Kyoto Dst fetch failed: ${res.status} ${res.statusText}`);
  }

  const html = await res.text();
  const value = parseDstFromHtml(html);
  const timeTag = new Date().toISOString(); // Kyoto page has no machine-readable timestamp

  return {
    indexName: 'Dst',
    value,
    timeTag,
  };
}

/**
 * Parse the most recent Dst value from the Kyoto WDC realtime HTML page.
 *
 * The page contains a <pre> block with a fixed-width table. Each data row
 * has the format:
 *
 *   DAY   1   2   3  ...  23  24    (header)
 *    01  -12  -8  -5 ...  -3  -1    (day 1, hours 1–24)
 *
 * We read all numeric data values (excluding day numbers), find the last
 * non-999 value (999 is Kyoto's "missing data" sentinel), and return it.
 */
function parseDstFromHtml(html: string): number {
  // Extract the <pre> block that contains the data table.
  const preMatch = html.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
  if (!preMatch) {
    throw new Error('Kyoto Dst: could not find <pre> data block in HTML');
  }

  const pre = preMatch[1];

  // Each data line starts with a 2-digit day number followed by hourly values.
  // Example line: "  20  -10  -15  -18  ..."
  // The day number is the first integer on the line; the rest are hourly Dst values.
  const dataLineRegex = /^\s{0,4}\d{2}\s+([\s\S]+)$/gm;
  const hourlyValues: number[] = [];

  let match: RegExpExecArray | null;
  while ((match = dataLineRegex.exec(pre)) !== null) {
    const tokens = match[1].trim().split(/\s+/);
    for (const token of tokens) {
      const n = parseInt(token, 10);
      if (!isNaN(n)) hourlyValues.push(n);
    }
  }

  if (!hourlyValues.length) {
    throw new Error('Kyoto Dst: no data values found in HTML');
  }

  // Walk backwards to find the last non-sentinel value.
  // Kyoto uses 9999 and 999 for missing/provisional.
  for (let i = hourlyValues.length - 1; i >= 0; i--) {
    if (hourlyValues[i] !== 999 && hourlyValues[i] !== 9999) {
      return hourlyValues[i];
    }
  }

  throw new Error('Kyoto Dst: all values are missing (999/9999 sentinels)');
}
