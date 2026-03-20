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

import { config } from './config';
import { fetchKp } from './adapter/fetchKp';
import { fetchXray } from './adapter/fetchXray';
import { fetchProton } from './adapter/fetchProton';
import { fetchF107 } from './adapter/fetchF107';
import { fetchDst } from './adapter/fetchDst';
import type { IndexReading, IndexName } from './adapter/types';
import {
  getActiveContracts,
  getExpiredUnsettledContracts,
  incrementOracleChecks,
  recordSettlement,
  closePool,
} from './db/contracts';
import { submitSettlement, getOraclePublicKey } from './settlement/settle';
import type { ActiveContract } from './db/contracts';

// ─── Threshold evaluation ─────────────────────────────────────────────────────

/**
 * Returns true if the current reading crosses the contract's IndexLevel.
 *
 * Direction of comparison:
 *   Kp, X-Ray, Proton, F10.7 → value >= threshold  (storm is above threshold)
 *   Dst                       → value <= threshold  (storm is more negative than threshold)
 */
function isThresholdCrossed(contract: ActiveContract, reading: IndexReading): boolean {
  if (reading.indexName === 'Dst') {
    return reading.value <= contract.indexLevel;
  }
  return reading.value >= contract.indexLevel;
}

// ─── Per-contract settlement ──────────────────────────────────────────────────

async function settleContract(contract: ActiveContract, outcome: 0 | 1): Promise<void> {
  try {
    const txSig = await submitSettlement(contract, outcome);
    await recordSettlement(contract, outcome, txSig);
  } catch (err) {
    console.error(
      `[oracle] Settlement failed for ${contract.contractAddress}:`,
      err instanceof Error ? err.message : err,
    );
    // Don't rethrow — a failed settlement will be retried on the next poll cycle.
  }
}

// ─── Core evaluation loop ─────────────────────────────────────────────────────

async function evaluateIndex(reading: IndexReading): Promise<void> {
  const { indexName, value, timeTag } = reading;
  console.log(`[${indexName}] ${timeTag}  value=${value}`);

  // 1. Check for triggered contracts (threshold crossed → Hedge wins).
  const active = await getActiveContracts(indexName);
  for (const contract of active) {
    await incrementOracleChecks(contract);
    if (isThresholdCrossed(contract, reading)) {
      console.log(
        `[${indexName}] Threshold crossed! contract=${contract.contractAddress}` +
          ` level=${contract.indexLevel} value=${value} → outcome=1 (Hedge wins)`,
      );
      await settleContract(contract, 1);
    }
  }

  // 2. Check for expired contracts (no trigger → Cover wins).
  const expired = await getExpiredUnsettledContracts(indexName);
  for (const contract of expired) {
    console.log(
      `[${indexName}] Contract expired without trigger: ${contract.contractAddress}` +
        ` → outcome=0 (Cover wins)`,
    );
    await settleContract(contract, 0);
  }
}

// ─── Individual pollers ───────────────────────────────────────────────────────

async function pollKp(): Promise<void> {
  try {
    const reading = await fetchKp();
    await evaluateIndex(reading);
  } catch (err) {
    console.error('[Kp] Poll error:', err instanceof Error ? err.message : err);
  }
}

async function pollXray(): Promise<void> {
  try {
    const reading = await fetchXray();
    await evaluateIndex(reading);
  } catch (err) {
    console.error('[X-ray] Poll error:', err instanceof Error ? err.message : err);
  }
}

async function pollProton(): Promise<void> {
  try {
    const reading = await fetchProton();
    await evaluateIndex(reading);
  } catch (err) {
    console.error('[Proton] Poll error:', err instanceof Error ? err.message : err);
  }
}

async function pollF107(): Promise<void> {
  try {
    const reading = await fetchF107();
    await evaluateIndex(reading);
  } catch (err) {
    console.error('[F10.7] Poll error:', err instanceof Error ? err.message : err);
  }
}

async function pollDst(): Promise<void> {
  try {
    const reading = await fetchDst();
    await evaluateIndex(reading);
  } catch (err) {
    console.error('[Dst] Poll error:', err instanceof Error ? err.message : err);
  }
}

// ─── Startup ──────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('ConditionCover Oracle starting...');
  console.log(`  Cluster:    ${config.solana.cluster}`);
  console.log(`  Program ID: ${config.solana.programId}`);
  console.log(`  Oracle key: ${getOraclePublicKey().toBase58()}`);
  console.log(`  DB:         ${config.db.user}@${config.db.host}/${config.db.database}`);
  console.log('');

  // Run each poller immediately on startup, then on interval.
  await Promise.all([pollKp(), pollXray(), pollProton(), pollF107(), pollDst()]);

  const timers = [
    setInterval(pollKp, config.poll.kpMs),
    setInterval(pollXray, config.poll.xrayMs),
    setInterval(pollProton, config.poll.protonMs),
    setInterval(pollF107, config.poll.f107Ms),
    setInterval(pollDst, config.poll.dstMs),
  ];

  console.log(
    `[oracle] Polling active:` +
      ` Kp/X-ray=${config.poll.kpMs / 1000}s` +
      ` Proton=${config.poll.protonMs / 1000}s` +
      ` F10.7/Dst=${config.poll.f107Ms / 1000}s`,
  );

  // ── Graceful shutdown ──
  async function shutdown(signal: string): Promise<void> {
    console.log(`\n[oracle] Received ${signal}, shutting down...`);
    timers.forEach(clearInterval);
    await closePool();
    process.exit(0);
  }

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch(err => {
  console.error('[oracle] Fatal error:', err);
  process.exit(1);
});
