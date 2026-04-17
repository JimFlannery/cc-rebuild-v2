// @ts-nocheck
import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import {
  createAccount,
  getAccount,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const IDL = require("../target/idl/condition_cover.json");

const PROGRAM_ID = new PublicKey("5PkPCbdZNFGYVJNjifxgZDGyeaMKmTeWPj4fxhYeeB9K");
const SSTM_MINT  = new PublicKey("GzHNybBLLxt7BcAs7ogTmD4m5Wnz8gRkwiHNpFkDY41S");

function loadKeypair(name: string): Keypair {
  const p = path.join(os.homedir(), ".config", "solana", name);
  return Keypair.fromSecretKey(Buffer.from(JSON.parse(fs.readFileSync(p, "utf-8"))));
}

// ── Contract parameters ─────────────────────────────────────────────────────
const DST_INDEX    = { dst: {} };
const DST_LEVEL    = new BN(-85000);
const COVERAGE     = new BN(1_000_000); // 1 SSTM
const PREMIUM      = new BN(12_000);    // 1.2%
const DENOMINATION = { sstm: {} };
const CONTRACT_DURATION_SECS = 90 * 24 * 3600;

const REWARD_APY_BPS = 1700;
const LOAN_APR_BPS   = 750;
const LTV_BPS        = 6700;
const FEE_BPS        = 100;
const NUM_LOOPS      = 1;
const TREASURY_FUND  = new BN(5_000_000); // 5 SSTM

const exp = (): BN => new BN(Math.floor(Date.now() / 1000) + CONTRACT_DURATION_SECS);

// ── PDA helpers ─────────────────────────────────────────────────────────────
function nonceBuf(n: BN): Buffer {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(n.toString()));
  return buf;
}
const orderPda    = (owner: PublicKey, nonce: BN) =>
  PublicKey.findProgramAddressSync([Buffer.from("order"), owner.toBuffer(), nonceBuf(nonce)], PROGRAM_ID)[0];
const escrowPda   = (order: PublicKey) =>
  PublicKey.findProgramAddressSync([Buffer.from("escrow"), order.toBuffer()], PROGRAM_ID)[0];
const contractPda = (hedge: PublicKey, cover: PublicKey) =>
  PublicKey.findProgramAddressSync([Buffer.from("contract"), hedge.toBuffer(), cover.toBuffer()], PROGRAM_ID)[0];
const contractEscrowPda = (contract: PublicKey) =>
  PublicKey.findProgramAddressSync([Buffer.from("contract_escrow"), contract.toBuffer()], PROGRAM_ID)[0];
const treasuryPda       = () => PublicKey.findProgramAddressSync([Buffer.from("treasury")], PROGRAM_ID)[0];
const treasuryEscrowPda = () => PublicKey.findProgramAddressSync([Buffer.from("treasury_escrow")], PROGRAM_ID)[0];
const loopSetPda        = (u1: PublicKey, u2: PublicKey, nonce: BN) =>
  PublicKey.findProgramAddressSync([Buffer.from("loop_set"), u1.toBuffer(), u2.toBuffer(), nonceBuf(nonce)], PROGRAM_ID)[0];

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  const connection = new anchor.web3.Connection("https://api.devnet.solana.com", "confirmed");
  const payer  = loadKeypair("id.json");
  const oracle = loadKeypair("oracle-keypair.json");
  const admin  = loadKeypair("admin-keypair.json");

  const wallet   = new anchor.Wallet(payer);
  const provider = new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" });
  anchor.setProvider(provider);
  const program = new Program(IDL, provider);

  const user1 = Keypair.generate();
  const user2 = Keypair.generate();
  console.log("User1:", user1.publicKey.toBase58());
  console.log("User2:", user2.publicKey.toBase58());

  // ── Nonces (unique per run) ─────────────────────────────────────────────
  const LS_NONCE   = new BN(Date.now());
  const U1_COVER_N = new BN(Date.now() + 1);
  const U1_HEDGE_N = new BN(Date.now() + 2);
  const U2_HEDGE_N = new BN(Date.now() + 3);
  const U2_COVER_N = new BN(Date.now() + 4);
  const U1_COVER_L1 = new BN(Date.now() + 10);
  const U1_HEDGE_L1 = new BN(Date.now() + 11);
  const U2_HEDGE_L1 = new BN(Date.now() + 12);
  const U2_COVER_L1 = new BN(Date.now() + 13);

  // ── Step 0: Fund test wallets ─────────────────────────────────────────────
  console.log("\n=== Step 0: Fund test wallets ===");

  for (const [name, kp] of [["User1", user1], ["User2", user2]] as const) {
    try {
      const sig = await connection.requestAirdrop(kp.publicKey, 2 * LAMPORTS_PER_SOL);
      await connection.confirmTransaction(sig, "confirmed");
      console.log(`  Airdropped 2 SOL to ${name}`);
    } catch {
      console.log(`  Airdrop failed for ${name}, transferring from payer...`);
      const tx = new anchor.web3.Transaction().add(
        anchor.web3.SystemProgram.transfer({
          fromPubkey: payer.publicKey,
          toPubkey: kp.publicKey,
          lamports: 0.5 * LAMPORTS_PER_SOL,
        })
      );
      await provider.sendAndConfirm(tx);
      console.log(`  Transferred 0.5 SOL to ${name}`);
    }
  }

  // Create SSTM token accounts and fund with test tokens
  const user1Token = await createAccount(connection, payer, SSTM_MINT, user1.publicKey);
  const user2Token = await createAccount(connection, payer, SSTM_MINT, user2.publicKey);
  console.log("  Created SSTM token accounts");

  // Mint test SSTM to users (payer is mint authority for devnet SSTM)
  for (const acct of [user1Token, user2Token]) {
    await mintTo(connection, payer, SSTM_MINT, acct, payer, 10_000_000);
  }
  console.log("  Minted 10 SSTM to each user");

  // ── Step 1: Init Treasury ─────────────────────────────────────────────────
  console.log("\n=== Step 1: Init Treasury ===");

  const treasury       = treasuryPda();
  const treasuryEscrow = treasuryEscrowPda();

  const treasuryInfo = await connection.getAccountInfo(treasury);
  if (treasuryInfo) {
    console.log("  Treasury already initialized, skipping.");
  } else {
    await program.methods.initTreasury()
      .accounts({
        treasury,
        treasuryEscrow,
        sstmMint: SSTM_MINT,
        admin: admin.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([admin])
      .rpc();
    console.log("  Treasury PDA:", treasury.toBase58());
    console.log("  Treasury escrow:", treasuryEscrow.toBase58());
  }

  // ── Step 2: Fund Treasury ─────────────────────────────────────────────────
  console.log("\n=== Step 2: Fund Treasury ===");

  const adminAta = await getOrCreateAssociatedTokenAccount(
    connection, payer, SSTM_MINT, admin.publicKey
  );
  // Mint SSTM to admin so they can fund the treasury
  await mintTo(connection, payer, SSTM_MINT, adminAta.address, payer, TREASURY_FUND.toNumber());
  console.log(`  Funded admin ATA with ${TREASURY_FUND.toNumber() / 1_000_000} SSTM`);

  await program.methods.fundTreasury(TREASURY_FUND)
    .accounts({
      treasury,
      treasuryEscrow,
      adminTokenAccount: adminAta.address,
      admin: admin.publicKey,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .signers([admin])
    .rpc();

  const t = await program.account.treasury.fetch(treasury);
  console.log(`  Treasury total funded: ${t.totalFunded.toString()} (${Number(t.totalFunded) / 1_000_000} SSTM)`);

  // ── Step 3: Create seed orders ────────────────────────────────────────────
  console.log("\n=== Step 3: Create seed orders ===");
  const expiry = exp();

  async function createOrder(owner: Keypair, ownerToken: PublicKey, nonce: BN, type: any) {
    const order = orderPda(owner.publicKey, nonce);
    await program.methods
      .createOrder(nonce, type, DST_INDEX, DST_LEVEL, COVERAGE, PREMIUM, expiry, DENOMINATION)
      .accounts({
        order, escrow: escrowPda(order),
        ownerTokenAccount: ownerToken, mint: SSTM_MINT,
        owner: owner.publicKey, tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([owner])
      .rpc();
    return order;
  }

  const u1Cover = await createOrder(user1, user1Token, U1_COVER_N, { cover: {} });
  const u1Hedge = await createOrder(user1, user1Token, U1_HEDGE_N, { hedge: {} });
  const u2Hedge = await createOrder(user2, user2Token, U2_HEDGE_N, { hedge: {} });
  const u2Cover = await createOrder(user2, user2Token, U2_COVER_N, { cover: {} });
  console.log("  4 seed orders created (User1: Cover+Hedge, User2: Hedge+Cover)");

  // ── Step 4: Create LoopSet ────────────────────────────────────────────────
  console.log("\n=== Step 4: Create LoopSet ===");

  const loopSet = loopSetPda(user1.publicKey, user2.publicKey, LS_NONCE);

  await program.methods
    .createLoopSet(LS_NONCE, NUM_LOOPS, REWARD_APY_BPS, LOAN_APR_BPS, LTV_BPS, FEE_BPS, exp())
    .accounts({
      loopSet,
      user1CoverOrder: u1Cover,
      user1HedgeOrder: u1Hedge,
      user2HedgeOrder: u2Hedge,
      user2CoverOrder: u2Cover,
      creator: user2.publicKey,
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .signers([user2])
    .rpc();

  let ls = await program.account.loopSet.fetch(loopSet);
  console.log(`  LoopSet created: status=${JSON.stringify(ls.status)}, loanPerUser=${ls.totalLoanedPerUser.toString()}`);

  // ── Step 5: Match initial pair + register ─────────────────────────────────
  console.log("\n=== Step 5: Match initial pair + register ===");

  const cA = contractPda(u2Hedge, u1Cover);
  const cB = contractPda(u1Hedge, u2Cover);

  // Match A-contract (user2 Hedge ↔ user1 Cover)
  await program.methods.matchOrder()
    .accounts({
      contract: cA, contractEscrow: contractEscrowPda(cA),
      hedgeOrder: u2Hedge, coverOrder: u1Cover,
      hedgeEscrow: escrowPda(u2Hedge), coverEscrow: escrowPda(u1Cover),
      coverOwnerTokenAccount: user1Token,
      hedgeOwnerTokenAccount: user2Token,
      mint: SSTM_MINT, matcher: payer.publicKey,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: anchor.web3.SystemProgram.programId,
    }).rpc();
  console.log("  Matched A-contract");

  // Match B-contract (user1 Hedge ↔ user2 Cover)
  await program.methods.matchOrder()
    .accounts({
      contract: cB, contractEscrow: contractEscrowPda(cB),
      hedgeOrder: u1Hedge, coverOrder: u2Cover,
      hedgeEscrow: escrowPda(u1Hedge), coverEscrow: escrowPda(u2Cover),
      coverOwnerTokenAccount: user2Token,
      hedgeOwnerTokenAccount: user1Token,
      mint: SSTM_MINT, matcher: payer.publicKey,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: anchor.web3.SystemProgram.programId,
    }).rpc();
  console.log("  Matched B-contract");

  // Register both into LoopSet
  await program.methods.registerLoopContract()
    .accounts({ loopSet, contract: cA, caller: user2.publicKey })
    .signers([user2]).rpc();
  await program.methods.registerLoopContract()
    .accounts({ loopSet, contract: cB, caller: user2.publicKey })
    .signers([user2]).rpc();

  ls = await program.account.loopSet.fetch(loopSet);
  console.log(`  Registered: contracts=${ls.contractsRegistered}, loopsDeployed=${ls.loopsDeployed}, status=${JSON.stringify(ls.status)}`);

  // ── Step 6: Issue loop 1 loan ─────────────────────────────────────────────
  console.log("\n=== Step 6: Issue loop 1 loan ===");

  await program.methods.issueLoopLoan(1)
    .accounts({
      loopSet, treasury, treasuryEscrow,
      user1TokenAccount: user1Token,
      user2TokenAccount: user2Token,
      sstmMint: SSTM_MINT,
      caller: payer.publicKey,
      tokenProgram: TOKEN_PROGRAM_ID,
    }).rpc();

  const u1Bal = await getAccount(connection, user1Token);
  const u2Bal = await getAccount(connection, user2Token);
  console.log(`  User1 SSTM balance: ${u1Bal.amount.toString()}`);
  console.log(`  User2 SSTM balance: ${u2Bal.amount.toString()}`);

  // ── Step 7: Create loop 1 orders, match, register ─────────────────────────
  console.log("\n=== Step 7: Deploy loop 1 contracts ===");

  const LOOP_COVERAGE = new BN(670_000);
  const LOOP_PREMIUM  = new BN(8_040);
  const loopExp       = exp();

  async function createLoopOrder(owner: Keypair, ownerToken: PublicKey, nonce: BN, type: any) {
    const order = orderPda(owner.publicKey, nonce);
    await program.methods
      .createOrder(nonce, type, DST_INDEX, DST_LEVEL, LOOP_COVERAGE, LOOP_PREMIUM, loopExp, DENOMINATION)
      .accounts({
        order, escrow: escrowPda(order),
        ownerTokenAccount: ownerToken, mint: SSTM_MINT,
        owner: owner.publicKey, tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([owner])
      .rpc();
    return order;
  }

  const u1CoverL1 = await createLoopOrder(user1, user1Token, U1_COVER_L1, { cover: {} });
  const u1HedgeL1 = await createLoopOrder(user1, user1Token, U1_HEDGE_L1, { hedge: {} });
  const u2HedgeL1 = await createLoopOrder(user2, user2Token, U2_HEDGE_L1, { hedge: {} });
  const u2CoverL1 = await createLoopOrder(user2, user2Token, U2_COVER_L1, { cover: {} });
  console.log("  4 loop-1 orders created");

  const cA1 = contractPda(u2HedgeL1, u1CoverL1);
  const cB1 = contractPda(u1HedgeL1, u2CoverL1);

  await program.methods.matchOrder()
    .accounts({
      contract: cA1, contractEscrow: contractEscrowPda(cA1),
      hedgeOrder: u2HedgeL1, coverOrder: u1CoverL1,
      hedgeEscrow: escrowPda(u2HedgeL1), coverEscrow: escrowPda(u1CoverL1),
      coverOwnerTokenAccount: user1Token,
      hedgeOwnerTokenAccount: user2Token,
      mint: SSTM_MINT, matcher: payer.publicKey,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: anchor.web3.SystemProgram.programId,
    }).rpc();

  await program.methods.matchOrder()
    .accounts({
      contract: cB1, contractEscrow: contractEscrowPda(cB1),
      hedgeOrder: u1HedgeL1, coverOrder: u2CoverL1,
      hedgeEscrow: escrowPda(u1HedgeL1), coverEscrow: escrowPda(u2CoverL1),
      coverOwnerTokenAccount: user2Token,
      hedgeOwnerTokenAccount: user1Token,
      mint: SSTM_MINT, matcher: payer.publicKey,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: anchor.web3.SystemProgram.programId,
    }).rpc();
  console.log("  Matched loop-1 A + B contracts");

  for (const c of [cA1, cB1]) {
    await program.methods.registerLoopContract()
      .accounts({ loopSet, contract: c, caller: user2.publicKey })
      .signers([user2]).rpc();
  }

  ls = await program.account.loopSet.fetch(loopSet);
  console.log(`  Registered: contracts=${ls.contractsRegistered}, loopsDeployed=${ls.loopsDeployed}, status=${JSON.stringify(ls.status)}`);

  // ── Step 8: Settle all contracts ──────────────────────────────────────────
  console.log("\n=== Step 8: Settle all contracts (cover wins) ===");

  const allContracts   = [cA, cB, cA1, cB1];
  const coverWinners   = [user1Token, user2Token, user1Token, user2Token];

  for (let i = 0; i < allContracts.length; i++) {
    await program.methods.settle(0) // cover wins
      .accounts({
        contract: allContracts[i],
        contractEscrow: contractEscrowPda(allContracts[i]),
        winnerTokenAccount: coverWinners[i],
        oracle: oracle.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([oracle])
      .rpc();
  }
  console.log("  Settled 4 contracts (outcome=0, cover wins on all)");

  // ── Step 9: Settle LoopSet ────────────────────────────────────────────────
  console.log("\n=== Step 9: Settle LoopSet ===");

  ls = await program.account.loopSet.fetch(loopSet);
  const interestPerUser = ls.totalInterestPerUser;
  console.log(`  Interest per user: ${interestPerUser.toString()} (${Number(interestPerUser) / 1_000_000} SSTM)`);

  const escrowBefore = (await getAccount(connection, treasuryEscrow)).amount;

  await program.methods
    .settleLoopSet(interestPerUser, interestPerUser)
    .accounts({
      loopSet, treasury, treasuryEscrow,
      user1TokenAccount: user1Token,
      user2TokenAccount: user2Token,
      user1: user1.publicKey,
      user2: user2.publicKey,
      oracle: oracle.publicKey,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .signers([user1, user2, oracle])
    .rpc();

  const escrowAfter = (await getAccount(connection, treasuryEscrow)).amount;
  ls = await program.account.loopSet.fetch(loopSet);

  console.log(`  LoopSet status: ${JSON.stringify(ls.status)}`);
  console.log(`  Interest collected: ${(escrowAfter - escrowBefore).toString()}`);
  console.log(`  Treasury escrow balance: ${escrowAfter.toString()} (${Number(escrowAfter) / 1_000_000} SSTM)`);

  console.log("\n✓ Yield Boost devnet test complete!");
}

main().catch((err) => {
  console.error("\n✗ Test failed:", err.message || err);
  if (err.logs) console.error("Program logs:", err.logs);
  process.exit(1);
});
