import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  Connection,
  Keypair,
  PublicKey,
  clusterApiUrl,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import * as anchor from '@coral-xyz/anchor';
import { config } from '../config';
import type { ActiveContract } from '../db/contracts';

// ─── Anchor IDL (minimal; update when the on-chain program is implemented) ───
//
// The `settle` instruction on the ConditionCover Anchor program takes:
//   - contract:  the Contract PDA account (mut)
//   - oracle:    the oracle authority signer (matches program's stored oracle pubkey)
//   - outcome:   u8 — 1 if hedge party wins (event triggered), 0 if cover party wins
//
// This IDL is intentionally minimal. Once `smartcontracts/` has a full build,
// replace this with the generated IDL from `smartcontracts/target/idl/`.
const SETTLE_IDL = {
  version: '0.0.1',
  name: 'condition_cover',
  instructions: [
    {
      name: 'settle',
      accounts: [
        { name: 'contract', isMut: true, isSigner: false },
        { name: 'oracle', isMut: false, isSigner: true },
        { name: 'systemProgram', isMut: false, isSigner: false },
      ],
      args: [{ name: 'outcome', type: 'u8' }],
    },
  ],
  accounts: [],
  errors: [],
  metadata: { address: config.solana.programId },
} as unknown as anchor.Idl;

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

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Submit a settlement transaction to the Solana program.
 *
 * @param contract  The contract row from MySQL.
 * @param outcome   1 = Hedge wins (trigger event occurred).
 *                  0 = Cover wins (contract expired without trigger).
 * @returns         The transaction signature (base58).
 *
 * The oracle wallet must be the `oracle_authority` stored in the on-chain
 * Contract account. Only this keypair can call `settle`.
 *
 * NOTE: The Anchor program's `settle` instruction is not yet implemented
 * (smartcontracts/ is still a stub). This call will fail until that
 * instruction is deployed. The settlement logic here is correct and will
 * work once the on-chain code is ready.
 */
export async function submitSettlement(
  contract: ActiveContract,
  outcome: 0 | 1,
): Promise<string> {
  const program = getProgram();
  const contractPubkey = new PublicKey(contract.contractAddress);

  console.log(
    `[settle] Submitting: contract=${contract.contractAddress} outcome=${outcome}`,
  );

  const txSignature = await program.methods
    .settle(outcome)
    .accounts({
      contract: contractPubkey,
      oracle: getOracleKeypair().publicKey,
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .rpc();

  console.log(`[settle] Confirmed: ${txSignature}`);
  return txSignature;
}

/** Expose the oracle's public key (useful for logging and on-chain setup). */
export function getOraclePublicKey(): PublicKey {
  return getOracleKeypair().publicKey;
}
