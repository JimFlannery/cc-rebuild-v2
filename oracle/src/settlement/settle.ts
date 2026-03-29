import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  Connection,
  Keypair,
  PublicKey,
  clusterApiUrl,
} from '@solana/web3.js';
import * as anchor from '@coral-xyz/anchor';
import { config } from '../config';
import type { ActiveContract } from '../db/contracts';

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
        { name: 'contract',           isMut: true,  isSigner: false },
        { name: 'contractEscrow',     isMut: true,  isSigner: false },
        { name: 'winnerTokenAccount', isMut: true,  isSigner: false },
        { name: 'oracle',             isMut: false, isSigner: true  },
        { name: 'tokenProgram',       isMut: false, isSigner: false },
      ],
      args: [{ name: 'outcome', type: 'u8' }],
    },
  ],
  accounts: [],
  errors: [],
  metadata: { address: config.solana.programId },
} as unknown as anchor.Idl;

// SPL Token program ID (well-known, stable across all clusters).
const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

// ─── Connection & keypair (initialised once, reused across calls) ─────────────

let _connection: Connection | undefined;
let _oracleKeypair: Keypair | undefined;
let _anchorProvider: anchor.AnchorProvider | undefined;
let _program: anchor.Program | undefined;

function resolveKeypairPath(raw: string): string {
  return raw.startsWith('~') ? path.join(os.homedir(), raw.slice(1)) : raw;
}

function getConnection(): Connection {
  if (!_connection) {
    const endpoint =
      config.solana.cluster === 'mainnet-beta'
        ? clusterApiUrl('mainnet-beta')
        : clusterApiUrl(config.solana.cluster as 'devnet' | 'testnet');
    _connection = new Connection(endpoint, 'confirmed');
  }
  return _connection;
}

function getOracleKeypair(): Keypair {
  if (!_oracleKeypair) {
    const resolvedPath = resolveKeypairPath(config.solana.keypairPath);
    const raw = fs.readFileSync(resolvedPath, 'utf-8');
    _oracleKeypair = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
  }
  return _oracleKeypair;
}

function getProgram(): anchor.Program {
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
function deriveContractEscrow(contractPubkey: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('contract_escrow'), contractPubkey.toBuffer()],
    new PublicKey(config.solana.programId),
  );
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
export async function submitSettlement(
  contract: ActiveContract,
  outcome: 0 | 1,
): Promise<string> {
  const program = getProgram();
  const contractPubkey = new PublicKey(contract.contractAddress);
  const contractEscrow = deriveContractEscrow(contractPubkey);
  const winnerTokenAccount = new PublicKey(
    outcome === 1 ? contract.hedgeAddress : contract.coverAddress,
  );

  console.log(
    `[settle] Submitting: contract=${contract.contractAddress}` +
      ` outcome=${outcome}` +
      ` winner=${winnerTokenAccount.toBase58()}`,
  );

  const txSignature = await program.methods
    .settle(outcome)
    .accounts({
      contract:           contractPubkey,
      contractEscrow,
      winnerTokenAccount,
      oracle:             getOracleKeypair().publicKey,
      tokenProgram:       TOKEN_PROGRAM_ID,
    })
    .rpc();

  console.log(`[settle] Confirmed: ${txSignature}`);
  return txSignature;
}

/** Expose the oracle's public key (useful for logging and on-chain setup). */
export function getOraclePublicKey(): PublicKey {
  return getOracleKeypair().publicKey;
}
