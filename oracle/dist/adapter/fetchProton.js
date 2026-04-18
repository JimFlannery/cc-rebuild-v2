"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchProton = fetchProton;
const config_1 = require("../config");
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
async function fetchProton() {
    const url = `${config_1.config.noaa.baseUrl}/json/goes/primary/integral-protons-1-day.json`;
    const res = await fetch(url);
    if (!res.ok) {
        throw new Error(`NOAA proton fetch failed: ${res.status} ${res.statusText}`);
    }
    const records = (await res.json());
    if (!records.length)
        throw new Error('NOAA proton: empty response');
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
