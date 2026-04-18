"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchXray = fetchXray;
const config_1 = require("../config");
// Standard flare classification uses the soft X-ray channel.
const SOFT_XRAY_CHANNEL = '0.1-0.8nm';
/**
 * Fetch the most recent GOES X-ray flux from NOAA SWPC.
 *
 * Source:  json/goes/primary/xrays-1-day.json  (updates every minute)
 * Channel: 0.1–0.8 nm (soft X-ray), electron-corrected flux in W/m².
 *
 * Flare thresholds:
 *   A < 1e-8  B < 1e-7  C < 1e-6  M < 1e-5  X ≥ 1e-4  (W/m²)
 *
 * Contracts store IndexLevel as the W/m² threshold (scientific notation float).
 */
async function fetchXray() {
    const url = `${config_1.config.noaa.baseUrl}/json/goes/primary/xrays-1-day.json`;
    const res = await fetch(url);
    if (!res.ok) {
        throw new Error(`NOAA X-ray fetch failed: ${res.status} ${res.statusText}`);
    }
    const records = (await res.json());
    if (!records.length)
        throw new Error('NOAA X-ray: empty response');
    // Filter to soft X-ray channel; records are chronological.
    const softChannel = records.filter(r => r.energy === SOFT_XRAY_CHANNEL);
    if (!softChannel.length) {
        throw new Error(`NOAA X-ray: no ${SOFT_XRAY_CHANNEL} records found`);
    }
    const latest = softChannel[softChannel.length - 1];
    return {
        indexName: 'Solar X-Ray Flux',
        value: latest.flux,
        timeTag: latest.time_tag,
    };
}
