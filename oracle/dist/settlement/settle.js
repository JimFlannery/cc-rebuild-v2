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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.submitSettlement = submitSettlement;
exports.getOraclePublicKey = getOraclePublicKey;
const fs_1 = __importDefault(require("fs"));
const os_1 = __importDefault(require("os"));
const path_1 = __importDefault(require("path"));
const web3_js_1 = require("@solana/web3.js");
const anchor = __importStar(require("@coral-xyz/anchor"));
const config_1 = require("../config");
// ─── Anchor IDL ───────────────────────────────────────────────────────────────
//
// Minimal IDL covering only the `settle` instruction.
//
// To regenerate after any program change:
//   cd smartcontracts && anchor build
//   cp target/idl/condition_cover.json oracle/src/settlement/condition_cover.idl.json
// Then replace this object with:
//   import IDL from './condition_cover.idl.json';
//
// Accounts match the Settle struct in:
//   smartcontracts/programs/condition_cover/src/instructions/settle.rs
const SETTLE_IDL = {
    version: '0.1.0',
    name: 'condition_cover',
    instructions: [
        {
            name: 'settle',
            accounts: [
                { name: 'contract', isMut: true, isSigner: false },
                { name: 'contractEscrow', isMut: true, isSigner: false },
                { name: 'winnerTokenAccount', isMut: true, isSigner: false },
                { name: 'oracle', isMut: false, isSigner: true },
                { name: 'tokenProgram', isMut: false, isSigner: false },
            ],
            args: [{ name: 'outcome', type: 'u8' }],
        },
    ],
    accounts: [],
    errors: [],
    metadata: { address: config_1.config.solana.programId },
};
// SPL Token program ID (well-known, stable across all clusters).
const TOKEN_PROGRAM_ID = new web3_js_1.PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
// ─── Connection & keypair (initialised once, reused across calls) ─────────────
let _connection;
let _oracleKeypair;
let _anchorProvider;
let _program;
function resolveKeypairPath(raw) {
    return raw.startsWith('~') ? path_1.default.join(os_1.default.homedir(), raw.slice(1)) : raw;
}
function getConnection() {
    if (!_connection) {
        const endpoint = config_1.config.solana.cluster === 'mainnet-beta'
            ? (0, web3_js_1.clusterApiUrl)('mainnet-beta')
            : (0, web3_js_1.clusterApiUrl)(config_1.config.solana.cluster);
        _connection = new web3_js_1.Connection(endpoint, 'confirmed');
    }
    return _connection;
}
function getOracleKeypair() {
    if (!_oracleKeypair) {
        const resolvedPath = resolveKeypairPath(config_1.config.solana.keypairPath);
        const raw = fs_1.default.readFileSync(resolvedPath, 'utf-8');
        _oracleKeypair = web3_js_1.Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
    }
    return _oracleKeypair;
}
function getProgram() {
    if (!_program) {
        const connection = getConnection();
        const keypair = getOracleKeypair();
        const wallet = new anchor.Wallet(keypair);
        _anchorProvider = new anchor.AnchorProvider(connection, wallet, {
            commitment: 'confirmed',
        });
        _program = new anchor.Program(SETTLE_IDL, _anchorProvider);
    }
    return _program;
}
// ─── PDA derivation ───────────────────────────────────────────────────────────
/**
 * Derive the contract escrow PDA.
 * Seeds: [b"contract_escrow", contract_pubkey]
 */
function deriveContractEscrow(contractPubkey) {
    const [pda] = web3_js_1.PublicKey.findProgramAddressSync([Buffer.from('contract_escrow'), contractPubkey.toBuffer()], new web3_js_1.PublicKey(config_1.config.solana.programId));
    return pda;
}
// ─── Public API ───────────────────────────────────────────────────────────────
/**
 * Submit a settlement transaction to the Solana program.
 *
 * @param contract  The contract row from MySQL.
 * @param outcome   1 = Hedge wins (trigger event occurred).
 *                  0 = Cover wins (contract expired without trigger).
 * @returns         The transaction signature (base58).
 *
 * Accounts resolved:
 *   contract           — from MySQL ContractAddress
 *   contractEscrow     — PDA [b"contract_escrow", contract]
 *   winnerTokenAccount — HedgeAddress (outcome=1) or CoverAddress (outcome=0)
 *   oracle             — ORACLE_AUTHORITY keypair (signer)
 *   tokenProgram       — SPL Token program
 */
async function submitSettlement(contract, outcome) {
    const program = getProgram();
    const contractPubkey = new web3_js_1.PublicKey(contract.contractAddress);
    const contractEscrow = deriveContractEscrow(contractPubkey);
    const winnerTokenAccount = new web3_js_1.PublicKey(outcome === 1 ? contract.hedgeAddress : contract.coverAddress);
    console.log(`[settle] Submitting: contract=${contract.contractAddress}` +
        ` outcome=${outcome}` +
        ` winner=${winnerTokenAccount.toBase58()}`);
    const txSignature = await program.methods
        .settle(outcome)
        .accounts({
        contract: contractPubkey,
        contractEscrow,
        winnerTokenAccount,
        oracle: getOracleKeypair().publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
    })
        .rpc();
    console.log(`[settle] Confirmed: ${txSignature}`);
    return txSignature;
}
/** Expose the oracle's public key (useful for logging and on-chain setup). */
function getOraclePublicKey() {
    return getOracleKeypair().publicKey;
}
