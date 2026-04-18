"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchF107 = fetchF107;
const config_1 = require("../config");
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
async function fetchF107() {
    const url = `${config_1.config.noaa.baseUrl}/json/f107_cm_flux.json`;
    const res = await fetch(url);
    if (!res.ok) {
        throw new Error(`NOAA F10.7 fetch failed: ${res.status} ${res.statusText}`);
    }
    const records = (await res.json());
    if (!records.length)
        throw new Error('NOAA F10.7: empty response');
    // Unlike other NOAA files, f107_cm_flux.json is newest-first.
    const latest = records[0];
    return {
        indexName: 'Solar Radio Flux',
        value: latest.flux,
        timeTag: latest.time_tag,
    };
}
