import * as dotenv from 'dotenv';
import type { Cluster } from '@solana/web3.js';

dotenv.config();

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required env var: ${key}`);
  return value;
}

export const config = {
  solana: {
    cluster: (process.env.SOLANA_CLUSTER ?? 'devnet') as Cluster,
    programId: requireEnv('PROGRAM_ID'),
    keypairPath: requireEnv('ORACLE_KEYPAIR_PATH'),
  },
  db: {
    host: process.env.DB_HOST ?? 'localhost',
    port: parseInt(process.env.DB_PORT ?? '3306', 10),
    database: requireEnv('DB_NAME'),
    user: requireEnv('DB_USER'),
    password: process.env.DB_PASSWORD ?? '',
  },
  noaa: {
    baseUrl: process.env.NOAA_BASE_URL ?? 'https://services.swpc.noaa.gov',
  },
  // How often each poller runs (milliseconds).
  //
  // DEV/TEST endpoints (current):
  //   Kp  — products/noaa-planetary-k-index.json  (3-hourly max Kp)
  //   Dst — products/kyoto-dst.json               (hourly)
  //
  // PRODUCTION endpoints (switch when ready):
  //   Kp  — json/planetary_k_index_1m.json        (1-minute, estimated_kp)
  //   Dst — products/kyoto-dst.json               (same)
  // How often each poller runs (milliseconds).
  //
  // DEV/TEST intervals (current) — all set to 3 hours except Dst (1 hour):
  //   Switch to production intervals when moving off devnet.
  //
  // PRODUCTION intervals:
  //   kpMs     → 60_000          (1 min,  planetary_k_index_1m.json)
  //   xrayMs   → 60_000          (1 min,  xrays-1-day.json)
  //   protonMs → 5 * 60_000      (5 min,  integral-protons-1-day.json)
  //   f107Ms   → 60 * 60_000     (1 hour, f107_cm_flux.json — published 3x/day)
  //   dstMs    → 60 * 60_000     (1 hour, kyoto-dst.json)
  poll: {
    kpMs:     3 * 60 * 60_000,   // dev: 3 hours
    xrayMs:   3 * 60 * 60_000,   // dev: 3 hours
    protonMs: 3 * 60 * 60_000,   // dev: 3 hours
    f107Ms:   3 * 60 * 60_000,   // dev: 3 hours
    dstMs:    60 * 60_000,        // dev: 1 hour
  },
} as const;
