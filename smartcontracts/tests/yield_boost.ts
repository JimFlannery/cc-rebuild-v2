/**
 * Yield Boost / Looping integration tests
 *
 * Tests the full delta-neutral looping lifecycle:
 *   init_treasury → fund_treasury → create_loop_set →
 *   match_order (×2) → register_loop_contract (×2) →
 *   issue_loop_loan → create_order (×4) → match_order (×2) →
 *   register_loop_contract (×2) → settle (×4) → settle_loop_set
 *
 * All tests run against a local validator (anchor test).
 * The admin keypair reuses the oracle keypair for local testing only.
 *
 * TODO (before private devnet deployment):
 *   - Replace ADMIN_AUTHORITY with a dedicated admin keypair in constants.rs
 *   - Generate: solana-keygen new -o ~/.config/solana/admin-keypair.json
 *   - Fund the admin keypair on devnet before running fund_treasury
 */

import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { ConditionCover } from "../target/types/condition_cover";
import {
  createMint,
  createAccount,
  mintTo,
  getAccount,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { assert } from "chai";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

describe("yield_boost", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.ConditionCover as Program<ConditionCover>;
  const connection = provider.connection;
  const payer = (provider.wallet as anchor.Wallet).payer;

  // Oracle/admin keypair — same for local testing; split before devnet.
  const oracleKeypairPath = path.join(os.homedir(), ".config", "solana", "oracle-keypair.json");
  const adminKeypair = Keypair.fromSecretKey(
    Buffer.from(JSON.parse(fs.readFileSync(oracleKeypairPath, "utf-8")))
  );
  const oracleKeypair = adminKeypair;

  // Two whale wallets — both will be Cover parties on each other's contracts.
  const user1 = Keypair.generate();
  const user2 = Keypair.generate();

  // SSTM test mint (stand-in for the real SSTM token on localnet)
  let sstmMint: PublicKey;
  let user1TokenAccount: PublicKey;
  let user2TokenAccount: PublicKey;
  let adminTokenAccount: PublicKey;

  // ── Contract parameters (Dst -850 nT, SSTM denomination) ──────────────────
  const DST_INDEX    = { dst: {} };
  const DST_LEVEL    = new BN(-85000);   // -850 nT × 100
  const COVERAGE     = new BN(1_000_000); // 1 SSTM (6 decimals)
  const PREMIUM      = new BN(12_000);    // 1.2% of coverage (Dst -850 annual odds)
  const DENOMINATION = { sstm: {} };
  const CONTRACT_DURATION_SECS = 90 * 24 * 3600; // 90 days

  // Loop settings (matching VariableSettings defaults)
  const REWARD_APY_BPS = 1700;  // 17.00%
  const LOAN_APR_BPS   = 750;   // 7.50%
  const LTV_BPS        = 6700;  // 67.00%
  const FEE_BPS        = 100;   // 1.00%
  const NUM_LOOPS      = 1;     // initial pair + 1 loan loop

  const TREASURY_FUND_AMOUNT = new BN(5_000_000); // 5 SSTM

  const expiration = (): BN =>
    new BN(Math.floor(Date.now() / 1000) + CONTRACT_DURATION_SECS);

  // ── PDA helpers ────────────────────────────────────────────────────────────

  function orderPda(owner: PublicKey, nonce: BN): PublicKey {
    const buf = Buffer.alloc(8);
    buf.writeBigUInt64LE(BigInt(nonce.toString()));
    return PublicKey.findProgramAddressSync(
      [Buffer.from("order"), owner.toBuffer(), buf],
      program.programId
    )[0];
  }

  function escrowPda(order: PublicKey): PublicKey {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("escrow"), order.toBuffer()],
      program.programId
    )[0];
  }

  function contractPda(hedgeOrder: PublicKey, coverOrder: PublicKey): PublicKey {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("contract"), hedgeOrder.toBuffer(), coverOrder.toBuffer()],
      program.programId
    )[0];
  }

  function contractEscrowPda(contract: PublicKey): PublicKey {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("contract_escrow"), contract.toBuffer()],
      program.programId
    )[0];
  }

  function treasuryPda(): PublicKey {
    return PublicKey.findProgramAddressSync([Buffer.from("treasury")], program.programId)[0];
  }

  function treasuryEscrowPda(): PublicKey {
    return PublicKey.findProgramAddressSync([Buffer.from("treasury_escrow")], program.programId)[0];
  }

  function loopSetPda(u1: PublicKey, u2: PublicKey, nonce: BN): PublicKey {
    const buf = Buffer.alloc(8);
    buf.writeBigUInt64LE(BigInt(nonce.toString()));
    return PublicKey.findProgramAddressSync(
      [Buffer.from("loop_set"), u1.toBuffer(), u2.toBuffer(), buf],
      program.programId
    )[0];
  }

  // ── Shared order nonces (unique per suite run) ─────────────────────────────
  const LS_NONCE   = new BN(Date.now());
  // Initial pair nonces
  const U1_COVER_N = new BN(Date.now() + 1);
  const U1_HEDGE_N = new BN(Date.now() + 2);
  const U2_HEDGE_N = new BN(Date.now() + 3);
  const U2_COVER_N = new BN(Date.now() + 4);
  // Loop 1 nonces
  const U1_COVER_L1 = new BN(Date.now() + 10);
  const U1_HEDGE_L1 = new BN(Date.now() + 11);
  const U2_HEDGE_L1 = new BN(Date.now() + 12);
  const U2_COVER_L1 = new BN(Date.now() + 13);

  // ── Setup ──────────────────────────────────────────────────────────────────

  before(async () => {
    await Promise.all([
      connection.requestAirdrop(user1.publicKey,      2 * LAMPORTS_PER_SOL),
      connection.requestAirdrop(user2.publicKey,      2 * LAMPORTS_PER_SOL),
      connection.requestAirdrop(adminKeypair.publicKey, 2 * LAMPORTS_PER_SOL),
    ]);
    await new Promise((r) => setTimeout(r, 1000));

    sstmMint = await createMint(connection, payer, payer.publicKey, null, 6);

    user1TokenAccount  = await createAccount(connection, payer, sstmMint, user1.publicKey);
    user2TokenAccount  = await createAccount(connection, payer, sstmMint, user2.publicKey);
    adminTokenAccount  = await createAccount(connection, payer, sstmMint, adminKeypair.publicKey);

    // Fund each user with enough SSTM to cover initial coverage + premiums.
    // User1 needs: coverage (as Cover) + premium (as Hedge) = 1_000_000 + 12_000
    // User2 same. Give 10× for headroom.
    for (const acct of [user1TokenAccount, user2TokenAccount, adminTokenAccount]) {
      await mintTo(connection, payer, sstmMint, acct, payer, 10_000_000);
    }
  });

  // ── 1. Treasury ────────────────────────────────────────────────────────────

  describe("init_treasury", () => {
    it("creates the treasury PDA and SSTM escrow", async () => {
      const treasury = treasuryPda();
      const treasuryEscrow = treasuryEscrowPda();

      await program.methods
        .initTreasury()
        .accounts({
          treasury,
          treasuryEscrow,
          sstmMint,
          admin: adminKeypair.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([adminKeypair])
        .rpc();

      const t = await program.account.treasury.fetch(treasury);
      assert.equal(t.totalFunded.toString(), "0");
      assert.equal(t.totalLoaned.toString(), "0");
      assert.equal(t.sstmMint.toBase58(), sstmMint.toBase58());
    });
  });

  describe("fund_treasury", () => {
    it("deposits SSTM into the treasury escrow", async () => {
      const treasury = treasuryPda();
      const treasuryEscrow = treasuryEscrowPda();

      await program.methods
        .fundTreasury(TREASURY_FUND_AMOUNT)
        .accounts({
          treasury,
          treasuryEscrow,
          adminTokenAccount,
          admin: adminKeypair.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([adminKeypair])
        .rpc();

      const t = await program.account.treasury.fetch(treasury);
      assert.equal(t.totalFunded.toString(), TREASURY_FUND_AMOUNT.toString());

      const escrow = await getAccount(connection, treasuryEscrow);
      assert.equal(escrow.amount.toString(), TREASURY_FUND_AMOUNT.toString());
    });
  });

  // ── 2. Create seed orders ──────────────────────────────────────────────────

  describe("seed orders", () => {
    it("user1 creates Cover and Hedge seed orders", async () => {
      const exp = expiration();

      // User1 Cover order
      const u1Cover = orderPda(user1.publicKey, U1_COVER_N);
      await program.methods
        .createOrder(U1_COVER_N, { cover: {} }, DST_INDEX, DST_LEVEL,
          COVERAGE, PREMIUM, exp, DENOMINATION)
        .accounts({
          order: u1Cover, escrow: escrowPda(u1Cover),
          ownerTokenAccount: user1TokenAccount, mint: sstmMint,
          owner: user1.publicKey, tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
        }).signers([user1]).rpc();

      // User1 Hedge order
      const u1Hedge = orderPda(user1.publicKey, U1_HEDGE_N);
      await program.methods
        .createOrder(U1_HEDGE_N, { hedge: {} }, DST_INDEX, DST_LEVEL,
          COVERAGE, PREMIUM, exp, DENOMINATION)
        .accounts({
          order: u1Hedge, escrow: escrowPda(u1Hedge),
          ownerTokenAccount: user1TokenAccount, mint: sstmMint,
          owner: user1.publicKey, tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
        }).signers([user1]).rpc();

      const cover = await program.account.order.fetch(u1Cover);
      const hedge = await program.account.order.fetch(u1Hedge);
      assert.deepEqual(cover.orderType, { cover: {} });
      assert.deepEqual(hedge.orderType, { hedge: {} });
    });

    it("user2 creates matching Hedge and Cover seed orders", async () => {
      const exp = expiration();

      // User2 Hedge (matches user1 Cover)
      const u2Hedge = orderPda(user2.publicKey, U2_HEDGE_N);
      await program.methods
        .createOrder(U2_HEDGE_N, { hedge: {} }, DST_INDEX, DST_LEVEL,
          COVERAGE, PREMIUM, exp, DENOMINATION)
        .accounts({
          order: u2Hedge, escrow: escrowPda(u2Hedge),
          ownerTokenAccount: user2TokenAccount, mint: sstmMint,
          owner: user2.publicKey, tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
        }).signers([user2]).rpc();

      // User2 Cover (matches user1 Hedge)
      const u2Cover = orderPda(user2.publicKey, U2_COVER_N);
      await program.methods
        .createOrder(U2_COVER_N, { cover: {} }, DST_INDEX, DST_LEVEL,
          COVERAGE, PREMIUM, exp, DENOMINATION)
        .accounts({
          order: u2Cover, escrow: escrowPda(u2Cover),
          ownerTokenAccount: user2TokenAccount, mint: sstmMint,
          owner: user2.publicKey, tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
        }).signers([user2]).rpc();

      const hedge = await program.account.order.fetch(u2Hedge);
      const cover = await program.account.order.fetch(u2Cover);
      assert.deepEqual(hedge.orderType, { hedge: {} });
      assert.deepEqual(cover.orderType, { cover: {} });
    });
  });

  // ── 3. Create LoopSet ──────────────────────────────────────────────────────

  describe("create_loop_set", () => {
    it("creates the LoopSet PDA with correct rates and loan totals", async () => {
      const loopSet = loopSetPda(user1.publicKey, user2.publicKey, LS_NONCE);
      const exp = expiration();

      await program.methods
        .createLoopSet(LS_NONCE, NUM_LOOPS,
          REWARD_APY_BPS, LOAN_APR_BPS, LTV_BPS, FEE_BPS, exp)
        .accounts({
          loopSet,
          user1CoverOrder: orderPda(user1.publicKey, U1_COVER_N),
          user1HedgeOrder: orderPda(user1.publicKey, U1_HEDGE_N),
          user2HedgeOrder: orderPda(user2.publicKey, U2_HEDGE_N),
          user2CoverOrder: orderPda(user2.publicKey, U2_COVER_N),
          creator: user2.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([user2])
        .rpc();

      const ls = await program.account.loopSet.fetch(loopSet);
      assert.equal(ls.user1.toBase58(), user1.publicKey.toBase58());
      assert.equal(ls.user2.toBase58(), user2.publicKey.toBase58());
      assert.deepEqual(ls.status, { pending: {} });
      assert.equal(ls.numLoops, NUM_LOOPS);
      assert.equal(ls.loopsDeployed, 0);
      assert.equal(ls.rewardApyBps, REWARD_APY_BPS);
      assert.equal(ls.ltvBps, LTV_BPS);
      // Total loaned per user = 1_000_000 × 0.67 = 670_000
      assert.equal(ls.totalLoanedPerUser.toString(), "670000");
    });

    it("rejects a LoopSet with mismatched order parameters", async () => {
      const badNonce = new BN(99999);
      const loopSet  = loopSetPda(user1.publicKey, user2.publicKey, badNonce);
      const exp      = expiration();

      // Create a mismatched cover order with wrong coverage
      const badNonce2  = new BN(88888);
      const badOrder   = orderPda(user1.publicKey, badNonce2);
      await program.methods
        .createOrder(badNonce2, { cover: {} }, DST_INDEX, DST_LEVEL,
          new BN(999), PREMIUM, exp, DENOMINATION) // wrong coverage
        .accounts({
          order: badOrder, escrow: escrowPda(badOrder),
          ownerTokenAccount: user1TokenAccount, mint: sstmMint,
          owner: user1.publicKey, tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
        }).signers([user1]).rpc();

      try {
        await program.methods
          .createLoopSet(badNonce, NUM_LOOPS, REWARD_APY_BPS, LOAN_APR_BPS, LTV_BPS, FEE_BPS, exp)
          .accounts({
            loopSet,
            user1CoverOrder: badOrder,                           // mismatched coverage
            user1HedgeOrder: orderPda(user1.publicKey, U1_HEDGE_N),
            user2HedgeOrder: orderPda(user2.publicKey, U2_HEDGE_N),
            user2CoverOrder: orderPda(user2.publicKey, U2_COVER_N),
            creator: user2.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
          }).signers([user2]).rpc();
        assert.fail("Should have thrown AmountMismatch");
      } catch (err: any) {
        assert.include(err.message, "AmountMismatch");
      }
    });
  });

  // ── 4. Match initial pair and register ────────────────────────────────────

  describe("match initial pair + register", () => {
    // A-contract: user2 Hedge ↔ user1 Cover
    // B-contract: user1 Hedge ↔ user2 Cover
    let contractA: PublicKey;
    let contractB: PublicKey;

    before(() => {
      contractA = contractPda(
        orderPda(user2.publicKey, U2_HEDGE_N),
        orderPda(user1.publicKey, U1_COVER_N)
      );
      contractB = contractPda(
        orderPda(user1.publicKey, U1_HEDGE_N),
        orderPda(user2.publicKey, U2_COVER_N)
      );
    });

    it("matches A-contract (user2 Hedge ↔ user1 Cover)", async () => {
      const hedgeOrder = orderPda(user2.publicKey, U2_HEDGE_N);
      const coverOrder = orderPda(user1.publicKey, U1_COVER_N);
      const u1BalBefore = (await getAccount(connection, user1TokenAccount)).amount;

      await program.methods.matchOrder()
        .accounts({
          contract: contractA, contractEscrow: contractEscrowPda(contractA),
          hedgeOrder, coverOrder,
          hedgeEscrow: escrowPda(hedgeOrder), coverEscrow: escrowPda(coverOrder),
          coverOwnerTokenAccount: user1TokenAccount,  // cover party = user1, receives premium
          hedgeOwnerTokenAccount: user2TokenAccount,
          mint: sstmMint, matcher: payer.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
        }).rpc();

      // User1 (Cover) should receive the hedge premium
      const u1BalAfter = (await getAccount(connection, user1TokenAccount)).amount;
      assert.equal((u1BalAfter - u1BalBefore).toString(), PREMIUM.toString(),
        "User1 should receive premium as the Cover party on A-contract");
    });

    it("matches B-contract (user1 Hedge ↔ user2 Cover)", async () => {
      const hedgeOrder = orderPda(user1.publicKey, U1_HEDGE_N);
      const coverOrder = orderPda(user2.publicKey, U2_COVER_N);
      const u2BalBefore = (await getAccount(connection, user2TokenAccount)).amount;

      await program.methods.matchOrder()
        .accounts({
          contract: contractB, contractEscrow: contractEscrowPda(contractB),
          hedgeOrder, coverOrder,
          hedgeEscrow: escrowPda(hedgeOrder), coverEscrow: escrowPda(coverOrder),
          coverOwnerTokenAccount: user2TokenAccount,  // cover party = user2
          hedgeOwnerTokenAccount: user1TokenAccount,
          mint: sstmMint, matcher: payer.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
        }).rpc();

      const u2BalAfter = (await getAccount(connection, user2TokenAccount)).amount;
      assert.equal((u2BalAfter - u2BalBefore).toString(), PREMIUM.toString(),
        "User2 should receive premium as the Cover party on B-contract");
    });

    it("registers A-contract into LoopSet → Pending", async () => {
      const loopSet = loopSetPda(user1.publicKey, user2.publicKey, LS_NONCE);

      await program.methods.registerLoopContract()
        .accounts({ loopSet, contract: contractA, caller: user2.publicKey })
        .signers([user2]).rpc();

      const ls = await program.account.loopSet.fetch(loopSet);
      assert.equal(ls.contractsRegistered, 1);
      assert.deepEqual(ls.status, { pending: {} }); // still pending — needs both contracts
    });

    it("registers B-contract into LoopSet → transitions to Active", async () => {
      const loopSet = loopSetPda(user1.publicKey, user2.publicKey, LS_NONCE);

      await program.methods.registerLoopContract()
        .accounts({ loopSet, contract: contractB, caller: user2.publicKey })
        .signers([user2]).rpc();

      const ls = await program.account.loopSet.fetch(loopSet);
      assert.equal(ls.contractsRegistered, 2);
      assert.equal(ls.loopsDeployed, 1);
      assert.deepEqual(ls.status, { active: {} }); // now Active
    });
  });

  // ── 5. Issue loop 1 loan ───────────────────────────────────────────────────

  describe("issue_loop_loan", () => {
    it("issues equal SSTM loans to both users for loop 1", async () => {
      const loopSet       = loopSetPda(user1.publicKey, user2.publicKey, LS_NONCE);
      const treasury      = treasuryPda();
      const treasuryEscrow = treasuryEscrowPda();

      const u1Before = (await getAccount(connection, user1TokenAccount)).amount;
      const u2Before = (await getAccount(connection, user2TokenAccount)).amount;
      // Expected loan: 1_000_000 × 0.67 = 670_000
      const expectedLoan = BigInt(670_000);

      await program.methods.issueLoopLoan(1)
        .accounts({
          loopSet, treasury, treasuryEscrow,
          user1TokenAccount, user2TokenAccount,
          sstmMint,
          caller: payer.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        }).rpc();

      const u1After = (await getAccount(connection, user1TokenAccount)).amount;
      const u2After = (await getAccount(connection, user2TokenAccount)).amount;
      assert.equal((u1After - u1Before).toString(), expectedLoan.toString(),
        "User1 should receive 670_000 SSTM loan");
      assert.equal((u2After - u2Before).toString(), expectedLoan.toString(),
        "User2 should receive 670_000 SSTM loan");

      const t = await program.account.treasury.fetch(treasury);
      assert.equal(t.totalLoaned.toString(), (expectedLoan * BigInt(2)).toString(),
        "Treasury should record 2 × 670_000 loaned");
    });

    it("rejects issuing loan 1 again (wrong loop_number)", async () => {
      const loopSet        = loopSetPda(user1.publicKey, user2.publicKey, LS_NONCE);
      const treasury       = treasuryPda();
      const treasuryEscrow = treasuryEscrowPda();

      try {
        await program.methods.issueLoopLoan(1) // still 1, but loops_deployed is now 2
          .accounts({
            loopSet, treasury, treasuryEscrow,
            user1TokenAccount, user2TokenAccount, sstmMint,
            caller: payer.publicKey, tokenProgram: TOKEN_PROGRAM_ID,
          }).rpc();
        assert.fail("Should have thrown LoopNumberMismatch");
      } catch (err: any) {
        assert.include(err.message, "LoopNumberMismatch");
      }
    });
  });

  // ── 6. Deploy loop 1 contracts ────────────────────────────────────────────

  describe("loop 1 contracts", () => {
    let contractA1: PublicKey;
    let contractB1: PublicKey;

    before(() => {
      contractA1 = contractPda(
        orderPda(user2.publicKey, U2_HEDGE_L1),
        orderPda(user1.publicKey, U1_COVER_L1)
      );
      contractB1 = contractPda(
        orderPda(user1.publicKey, U1_HEDGE_L1),
        orderPda(user2.publicKey, U2_COVER_L1)
      );
    });

    it("users create loop 1 orders from loaned SSTM", async () => {
      const exp          = expiration();
      const LOOP_COVERAGE = new BN(670_000);
      const LOOP_PREMIUM  = new BN(8_040); // 1.2% of 670_000

      // User1 loop 1 Cover + Hedge
      for (const [nonce, type] of [[U1_COVER_L1, { cover: {} }], [U1_HEDGE_L1, { hedge: {} }]] as const) {
        const order = orderPda(user1.publicKey, nonce);
        await program.methods
          .createOrder(nonce, type, DST_INDEX, DST_LEVEL,
            LOOP_COVERAGE, LOOP_PREMIUM, exp, DENOMINATION)
          .accounts({
            order, escrow: escrowPda(order),
            ownerTokenAccount: user1TokenAccount, mint: sstmMint,
            owner: user1.publicKey, tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: anchor.web3.SystemProgram.programId,
          }).signers([user1]).rpc();
      }

      // User2 loop 1 Hedge + Cover
      for (const [nonce, type] of [[U2_HEDGE_L1, { hedge: {} }], [U2_COVER_L1, { cover: {} }]] as const) {
        const order = orderPda(user2.publicKey, nonce);
        await program.methods
          .createOrder(nonce, type, DST_INDEX, DST_LEVEL,
            LOOP_COVERAGE, LOOP_PREMIUM, exp, DENOMINATION)
          .accounts({
            order, escrow: escrowPda(order),
            ownerTokenAccount: user2TokenAccount, mint: sstmMint,
            owner: user2.publicKey, tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: anchor.web3.SystemProgram.programId,
          }).signers([user2]).rpc();
      }

      const ls = await program.account.loopSet.fetch(
        loopSetPda(user1.publicKey, user2.publicKey, LS_NONCE)
      );
      assert.deepEqual(ls.status, { active: {} });
    });

    it("matches and registers loop 1 contracts, completing the LoopSet", async () => {
      const loopSet      = loopSetPda(user1.publicKey, user2.publicKey, LS_NONCE);
      const LOOP_COVERAGE = new BN(670_000);
      const LOOP_PREMIUM  = new BN(8_040);

      const hedgeOrderA = orderPda(user2.publicKey, U2_HEDGE_L1);
      const coverOrderA = orderPda(user1.publicKey, U1_COVER_L1);
      await program.methods.matchOrder()
        .accounts({
          contract: contractA1, contractEscrow: contractEscrowPda(contractA1),
          hedgeOrder: hedgeOrderA, coverOrder: coverOrderA,
          hedgeEscrow: escrowPda(hedgeOrderA), coverEscrow: escrowPda(coverOrderA),
          coverOwnerTokenAccount: user1TokenAccount,
          hedgeOwnerTokenAccount: user2TokenAccount,
          mint: sstmMint, matcher: payer.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
        }).rpc();

      const hedgeOrderB = orderPda(user1.publicKey, U1_HEDGE_L1);
      const coverOrderB = orderPda(user2.publicKey, U2_COVER_L1);
      await program.methods.matchOrder()
        .accounts({
          contract: contractB1, contractEscrow: contractEscrowPda(contractB1),
          hedgeOrder: hedgeOrderB, coverOrder: coverOrderB,
          hedgeEscrow: escrowPda(hedgeOrderB), coverEscrow: escrowPda(coverOrderB),
          coverOwnerTokenAccount: user2TokenAccount,
          hedgeOwnerTokenAccount: user1TokenAccount,
          mint: sstmMint, matcher: payer.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
        }).rpc();

      // Register both loop 1 contracts
      for (const c of [contractA1, contractB1]) {
        await program.methods.registerLoopContract()
          .accounts({ loopSet, contract: c, caller: user2.publicKey })
          .signers([user2]).rpc();
      }

      const ls = await program.account.loopSet.fetch(loopSet);
      assert.equal(ls.contractsRegistered, 4); // 2 initial + 2 loop 1
      assert.equal(ls.loopsDeployed, 2);        // loop 0 + loop 1
      assert.deepEqual(ls.status, { active: {} });
    });
  });

  // ── 7. Settle all contracts then settle_loop_set ───────────────────────────

  describe("settle_loop_set", () => {
    it("settles all 4 contracts (cover wins on all — no event occurred)", async () => {
      const allContracts = [
        contractPda(orderPda(user2.publicKey, U2_HEDGE_N),  orderPda(user1.publicKey, U1_COVER_N)),
        contractPda(orderPda(user1.publicKey, U1_HEDGE_N),  orderPda(user2.publicKey, U2_COVER_N)),
        contractPda(orderPda(user2.publicKey, U2_HEDGE_L1), orderPda(user1.publicKey, U1_COVER_L1)),
        contractPda(orderPda(user1.publicKey, U1_HEDGE_L1), orderPda(user2.publicKey, U2_COVER_L1)),
      ];
      // Cover winners alternate: user1, user2, user1, user2
      const coverWinners = [user1TokenAccount, user2TokenAccount, user1TokenAccount, user2TokenAccount];

      for (let i = 0; i < allContracts.length; i++) {
        await program.methods.settle(0)  // outcome=0: cover wins
          .accounts({
            contract: allContracts[i],
            contractEscrow: contractEscrowPda(allContracts[i]),
            winnerTokenAccount: coverWinners[i],
            oracle: oracleKeypair.publicKey,
            tokenProgram: TOKEN_PROGRAM_ID,
          }).signers([oracleKeypair]).rpc();

        const ct = await program.account.contract.fetch(allContracts[i]);
        assert.equal(ct.outcome, 0, `Contract ${i} should be settled with outcome=0`);
      }
    });

    it("settle_loop_set collects interest and marks LoopSet Settled", async () => {
      const loopSet        = loopSetPda(user1.publicKey, user2.publicKey, LS_NONCE);
      const treasury       = treasuryPda();
      const treasuryEscrow = treasuryEscrowPda();

      const ls = await program.account.loopSet.fetch(loopSet);
      // Use on-chain estimate for interest (both users pay the same)
      const interestPerUser = ls.totalInterestPerUser;

      const escrowBefore = (await getAccount(connection, treasuryEscrow)).amount;

      await program.methods
        .settleLoopSet(interestPerUser, interestPerUser)
        .accounts({
          loopSet, treasury, treasuryEscrow,
          user1TokenAccount, user2TokenAccount,
          user1: user1.publicKey, user2: user2.publicKey,
          oracle: oracleKeypair.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([user1, user2, oracleKeypair])
        .rpc();

      const escrowAfter = (await getAccount(connection, treasuryEscrow)).amount;
      const interestCollected = escrowAfter - escrowBefore;
      assert.equal(
        interestCollected.toString(),
        (interestPerUser.toNumber() * 2).toString(),
        "Treasury escrow should increase by both users' interest"
      );

      const lsFinal = await program.account.loopSet.fetch(loopSet);
      assert.deepEqual(lsFinal.status, { settled: {} });
    });
  });
});
