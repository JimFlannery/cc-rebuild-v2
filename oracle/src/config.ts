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
  kyoto: {
    dstUrl:
      process.env.KYOTO_DST_URL ??
      'http://wdc.kugi.kyoto-u.ac.jp/dst_realtime/presentmonth/index.html',
  },
  // How often each poller runs (milliseconds).
  // Aligned to NOAA SWPC update frequencies.
  poll: {
    kpMs: 60_000,           // Kp: every 1 minute
    xrayMs: 60_000,         // X-ray flux: every 1 minute
    protonMs: 5 * 60_000,   // Proton flux: every 5 minutes
    f107Ms: 60 * 60_000,    // F10.7: 3x/day — poll every hour
    dstMs: 60 * 60_000,     // Dst: hourly from Kyoto WDC
  },
} as const;
