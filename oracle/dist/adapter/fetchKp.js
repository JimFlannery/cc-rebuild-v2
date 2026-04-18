"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchKp = fetchKp;
const config_1 = require("../config");
/**
 * Fetch the most recent 3-hourly Kp-Index from NOAA SWPC.
 *
 * Source:  products/noaa-planetary-k-index.json  (updates every 3 hours)
 * Format:  Array of arrays; first row is the header.
 * Value:   Kp at index [1] — the maximum Kp achieved during that 3-hour period.
 *
 * Used for development/testing. Switch to planetary_k_index_1m.json for
 * production (1-minute updates, estimated_kp field).
 */
async function fetchKp() {
    const url = `${config_1.config.noaa.baseUrl}/products/noaa-planetary-k-index.json`;
    const res = await fetch(url);
    if (!res.ok) {
        throw new Error(`NOAA Kp fetch failed: ${res.status} ${res.statusText}`);
    }
    const rows = (await res.json());
    if (rows.length < 2)
        throw new Error('NOAA Kp: no data rows (only header)');
    // Row 0 is the header ["time_tag", "Kp", ...]; last row is most recent.
    const latest = rows[rows.length - 1];
    const value = parseFloat(latest[1]);
    if (isNaN(value)) {
        throw new Error(`NOAA Kp: could not parse value from row: ${JSON.stringify(latest)}`);
    }
    return {
        indexName: 'Kp',
        value,
        timeTag: latest[0],
    };
}
