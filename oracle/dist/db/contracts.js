"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getActiveContracts = getActiveContracts;
exports.getExpiredUnsettledContracts = getExpiredUnsettledContracts;
exports.incrementOracleChecks = incrementOracleChecks;
exports.recordSettlement = recordSettlement;
exports.closePool = closePool;
const promise_1 = __importDefault(require("mysql2/promise"));
const config_1 = require("../config");
let pool;
function getPool() {
    if (!pool) {
        pool = promise_1.default.createPool({
            host: config_1.config.db.host,
            port: config_1.config.db.port,
            database: config_1.config.db.database,
            user: config_1.config.db.user,
            password: config_1.config.db.password,
            waitForConnections: true,
            connectionLimit: 5,
        });
    }
    return pool;
}
/**
 * Query MySQL for all active contracts watching a given index.
 *
 * "Active" means:
 *   - The order is of type Hedge AND has a matching Cover order (Contracts row exists)
 *   - ContractExpiration is in the future
 *   - ContractOutcome is NULL (not yet settled)
 *
 * We join Orders (twice) and Contracts to get the full picture.
 */
async function getActiveContracts(indexName) {
    const db = getPool();
    const [rows] = await db.execute(`SELECT
       c.HedgeOrderID      AS hedgeOrderId,
       c.CoverOrderID      AS coverOrderId,
       c.ContractAddress   AS contractAddress,
       c.HedgeAddress      AS hedgeAddress,
       c.CoverAddress      AS coverAddress,
       h.IndexName         AS indexName,
       h.IndexLevel        AS indexLevel,
       h.ContractExpiration AS expiration,
       h.OracleChecks      AS oracleChecks
     FROM Contracts c
     JOIN Orders h ON h.OrderID = c.HedgeOrderID
     WHERE h.IndexName = ?
       AND h.ContractExpiration > NOW()
       AND c.ContractOutcome IS NULL`, [indexName]);
    return rows.map(r => ({
        hedgeOrderId: r.hedgeOrderId,
        coverOrderId: r.coverOrderId,
        contractAddress: r.contractAddress,
        hedgeAddress: r.hedgeAddress,
        coverAddress: r.coverAddress,
        indexName: r.indexName,
        indexLevel: parseFloat(r.indexLevel),
        expiration: new Date(r.expiration),
        oracleChecks: parseInt(r.oracleChecks, 10),
    }));
}
/**
 * Query MySQL for contracts that have expired without being settled.
 * The oracle calls this to finalize outcome=0 (Cover party wins).
 */
async function getExpiredUnsettledContracts(indexName) {
    const db = getPool();
    const [rows] = await db.execute(`SELECT
       c.HedgeOrderID      AS hedgeOrderId,
       c.CoverOrderID      AS coverOrderId,
       c.ContractAddress   AS contractAddress,
       c.HedgeAddress      AS hedgeAddress,
       c.CoverAddress      AS coverAddress,
       h.IndexName         AS indexName,
       h.IndexLevel        AS indexLevel,
       h.ContractExpiration AS expiration,
       h.OracleChecks      AS oracleChecks
     FROM Contracts c
     JOIN Orders h ON h.OrderID = c.HedgeOrderID
     WHERE h.IndexName = ?
       AND h.ContractExpiration <= NOW()
       AND c.ContractOutcome IS NULL`, [indexName]);
    return rows.map(r => ({
        hedgeOrderId: r.hedgeOrderId,
        coverOrderId: r.coverOrderId,
        contractAddress: r.contractAddress,
        hedgeAddress: r.hedgeAddress,
        coverAddress: r.coverAddress,
        indexName: r.indexName,
        indexLevel: parseFloat(r.indexLevel),
        expiration: new Date(r.expiration),
        oracleChecks: parseInt(r.oracleChecks, 10),
    }));
}
/**
 * Increment OracleChecks on both the Hedge and Cover orders after each poll.
 */
async function incrementOracleChecks(contract) {
    const db = getPool();
    await db.execute(`UPDATE Orders SET OracleChecks = OracleChecks + 1, updatedAt = NOW()
     WHERE OrderID IN (?, ?)`, [contract.hedgeOrderId, contract.coverOrderId]);
}
/**
 * Record the settlement outcome in MySQL after the on-chain transaction confirms.
 * outcome: 1 = Hedge wins (event occurred), 0 = Cover wins (expired without event).
 */
async function recordSettlement(contract, outcome, txSignature) {
    const db = getPool();
    await db.execute(`UPDATE Contracts
     SET ContractOutcome = ?,
         updatedAt = NOW()
     WHERE HedgeOrderID = ?`, [outcome, contract.hedgeOrderId]);
    // Mark both orders as Settled
    await db.execute(`UPDATE Orders
     SET Status = 'Settled', updatedAt = NOW()
     WHERE OrderID IN (?, ?)`, [contract.hedgeOrderId, contract.coverOrderId]);
    console.log(`[DB] Settled contract ${contract.contractAddress} | outcome=${outcome} | tx=${txSignature}`);
}
/** Close the connection pool (call on graceful shutdown). */
async function closePool() {
    if (pool) {
        await pool.end();
        pool = undefined;
    }
}
