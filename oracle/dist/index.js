"use strict";
/**
 * ConditionCover Oracle — Main entry point.
 *
 * Runs a set of independent polling loops, one per index type.
 * Each loop:
 *   1. Fetches the current index value from NOAA SWPC (or Kyoto WDC for Dst).
 *   2. Queries MySQL for active contracts watching that index.
 *   3. Evaluates the threshold condition for each contract.
 *   4. Submits a Solana settlement transaction for triggered or expired contracts.
 *   5. Updates MySQL (OracleChecks, ContractOutcome, Status).
 *
 * Poll intervals are aligned to each data source's update frequency.
 */
Object.defineProperty(exports, "__esModule", { value: true });
const config_1 = require("./config");
const fetchKp_1 = require("./adapter/fetchKp");
const fetchXray_1 = require("./adapter/fetchXray");
const fetchProton_1 = require("./adapter/fetchProton");
const fetchF107_1 = require("./adapter/fetchF107");
const fetchDst_1 = require("./adapter/fetchDst");
const contracts_1 = require("./db/contracts");
const settle_1 = require("./settlement/settle");
// ─── Threshold evaluation ─────────────────────────────────────────────────────
/**
 * Returns true if the current reading crosses the contract's IndexLevel.
 *
 * The on-chain program stores `index_level` as a fixed-point integer ×100
 * (e.g. Kp 5.0 → 500, Dst -120 nT → -12000).  MySQL mirrors this value.
 * NOAA adapters return natural float values (5.0, -120.0), so we decode
 * the stored threshold by dividing by 100 before comparing.
 *
 * Direction of comparison:
 *   Kp, X-Ray, Proton, F10.7 → value >= threshold  (storm is above threshold)
 *   Dst                       → value <= threshold  (storm is more negative than threshold)
 */
function isThresholdCrossed(contract, reading) {
    const threshold = contract.indexLevel / 100; // decode fixed-point ×100
    if (reading.indexName === 'Dst') {
        return reading.value <= threshold;
    }
    return reading.value >= threshold;
}
// ─── Per-contract settlement ──────────────────────────────────────────────────
async function settleContract(contract, outcome) {
    try {
        const txSig = await (0, settle_1.submitSettlement)(contract, outcome);
        await (0, contracts_1.recordSettlement)(contract, outcome, txSig);
    }
    catch (err) {
        console.error(`[oracle] Settlement failed for ${contract.contractAddress}:`, err instanceof Error ? err.message : err);
        // Don't rethrow — a failed settlement will be retried on the next poll cycle.
    }
}
// ─── Core evaluation loop ─────────────────────────────────────────────────────
async function evaluateIndex(reading) {
    const { indexName, value, timeTag } = reading;
    console.log(`[${indexName}] ${timeTag}  value=${value}`);
    // 1. Check for triggered contracts (threshold crossed → Hedge wins).
    const active = await (0, contracts_1.getActiveContracts)(indexName);
    for (const contract of active) {
        await (0, contracts_1.incrementOracleChecks)(contract);
        if (isThresholdCrossed(contract, reading)) {
            console.log(`[${indexName}] Threshold crossed! contract=${contract.contractAddress}` +
                ` level=${contract.indexLevel} value=${value} → outcome=1 (Hedge wins)`);
            await settleContract(contract, 1);
        }
    }
    // 2. Check for expired contracts (no trigger → Cover wins).
    const expired = await (0, contracts_1.getExpiredUnsettledContracts)(indexName);
    for (const contract of expired) {
        console.log(`[${indexName}] Contract expired without trigger: ${contract.contractAddress}` +
            ` → outcome=0 (Cover wins)`);
        await settleContract(contract, 0);
    }
}
// ─── Individual pollers ───────────────────────────────────────────────────────
async function pollKp() {
    try {
        const reading = await (0, fetchKp_1.fetchKp)();
        await evaluateIndex(reading);
    }
    catch (err) {
        console.error('[Kp] Poll error:', err instanceof Error ? err.message : err);
    }
}
async function pollXray() {
    try {
        const reading = await (0, fetchXray_1.fetchXray)();
        await evaluateIndex(reading);
    }
    catch (err) {
        console.error('[X-ray] Poll error:', err instanceof Error ? err.message : err);
    }
}
async function pollProton() {
    try {
        const reading = await (0, fetchProton_1.fetchProton)();
        await evaluateIndex(reading);
    }
    catch (err) {
        console.error('[Proton] Poll error:', err instanceof Error ? err.message : err);
    }
}
async function pollF107() {
    try {
        const reading = await (0, fetchF107_1.fetchF107)();
        await evaluateIndex(reading);
    }
    catch (err) {
        console.error('[F10.7] Poll error:', err instanceof Error ? err.message : err);
    }
}
async function pollDst() {
    try {
        const reading = await (0, fetchDst_1.fetchDst)();
        await evaluateIndex(reading);
    }
    catch (err) {
        console.error('[Dst] Poll error:', err instanceof Error ? err.message : err);
    }
}
// ─── Startup ──────────────────────────────────────────────────────────────────
async function main() {
    console.log('ConditionCover Oracle starting...');
    console.log(`  Cluster:    ${config_1.config.solana.cluster}`);
    console.log(`  Program ID: ${config_1.config.solana.programId}`);
    console.log(`  Oracle key: ${(0, settle_1.getOraclePublicKey)().toBase58()}`);
    console.log(`  DB:         ${config_1.config.db.user}@${config_1.config.db.host}/${config_1.config.db.database}`);
    console.log('');
    // Run each poller immediately on startup, then on interval.
    await Promise.all([pollKp(), pollXray(), pollProton(), pollF107(), pollDst()]);
    const timers = [
        setInterval(pollKp, config_1.config.poll.kpMs),
        setInterval(pollXray, config_1.config.poll.xrayMs),
        setInterval(pollProton, config_1.config.poll.protonMs),
        setInterval(pollF107, config_1.config.poll.f107Ms),
        setInterval(pollDst, config_1.config.poll.dstMs),
    ];
    console.log(`[oracle] Polling active:` +
        ` Kp/X-ray=${config_1.config.poll.kpMs / 1000}s` +
        ` Proton=${config_1.config.poll.protonMs / 1000}s` +
        ` F10.7/Dst=${config_1.config.poll.f107Ms / 1000}s`);
    // ── Graceful shutdown ──
    async function shutdown(signal) {
        console.log(`\n[oracle] Received ${signal}, shutting down...`);
        timers.forEach(clearInterval);
        await (0, contracts_1.closePool)();
        process.exit(0);
    }
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
}
main().catch(err => {
    console.error('[oracle] Fatal error:', err);
    process.exit(1);
});
