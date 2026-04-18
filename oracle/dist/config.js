"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
const dotenv = __importStar(require("dotenv"));
dotenv.config();
function requireEnv(key) {
    const value = process.env[key];
    if (!value)
        throw new Error(`Missing required env var: ${key}`);
    return value;
}
exports.config = {
    solana: {
        cluster: (process.env.SOLANA_CLUSTER ?? 'devnet'),
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
        kpMs: 3 * 60 * 60_000, // dev: 3 hours
        xrayMs: 3 * 60 * 60_000, // dev: 3 hours
        protonMs: 3 * 60 * 60_000, // dev: 3 hours
        f107Ms: 3 * 60 * 60_000, // dev: 3 hours
        dstMs: 60 * 60_000, // dev: 1 hour
    },
};
