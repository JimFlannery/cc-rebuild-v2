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

describe("condition_cover", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.ConditionCover as Program<ConditionCover>;
  const connection = provider.connection;
  const payer = (provider.wallet as anchor.Wallet).payer;

  // Load the oracle keypair — must match ORACLE_AUTHORITY in constants.rs.
  const oracleKeypairPath = path.join(
    os.homedir(),
    ".config",
    "solana",
    "oracle-keypair.json"
  );
  const oracleKeypair = Keypair.fromSecretKey(
    Buffer.from(JSON.parse(fs.readFileSync(oracleKeypairPath, "utf-8")))
  );

  // Test mint (stands in for USDC on localnet)
  let mint: PublicKey;

  // Wallets for hedge and cover parties
  const hedgeWallet = Keypair.generate();
  const coverWallet = Keypair.generate();

  // Token accounts
  let hedgeTokenAccount: PublicKey;
  let coverTokenAccount: PublicKey;

  // Order nonces
  const HEDGE_NONCE = new BN(1);
  const COVER_NONCE = new BN(1);

  // Order parameters
  const INDEX_NAME = { kp: {} };          // Kp index
  const INDEX_LEVEL = new BN(500);         // Kp 5.0 × 100
  const COVERAGE = new BN(1_000_000);      // 1 USDC (6 decimals)
  const HEDGE_PREMIUM = new BN(100_000);   // 0.1 USDC
  const DENOMINATION = { usdc: {} };

  // Expiration 1 hour from now
  const expiration = (): BN =>
    new BN(Math.floor(Date.now() / 1000) + 3600);

  // ─── Helpers ───────────────────────────────────────────────────────────────

  function orderPda(owner: PublicKey, nonce: BN): [PublicKey, number] {
    const nonceBuf = Buffer.alloc(8);
    nonceBuf.writeBigUInt64LE(BigInt(nonce.toString()));
    return PublicKey.findProgramAddressSync(
      [Buffer.from("order"), owner.toBuffer(), nonceBuf],
      program.programId
    );
  }

  function escrowPda(order: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("escrow"), order.toBuffer()],
      program.programId
    );
  }

  function contractPda(
    hedgeOrder: PublicKey,
    coverOrder: PublicKey
  ): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("contract"), hedgeOrder.toBuffer(), coverOrder.toBuffer()],
      program.programId
    );
  }

  function contractEscrowPda(contract: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("contract_escrow"), contract.toBuffer()],
      program.programId
    );
  }

  // ─── Setup ─────────────────────────────────────────────────────────────────

  before(async () => {
    // Airdrop SOL to test wallets and oracle
    await Promise.all([
      connection.requestAirdrop(hedgeWallet.publicKey, 2 * LAMPORTS_PER_SOL),
      connection.requestAirdrop(coverWallet.publicKey, 2 * LAMPORTS_PER_SOL),
      connection.requestAirdrop(oracleKeypair.publicKey, 2 * LAMPORTS_PER_SOL),
    ]);
    // Wait for confirmations
    await new Promise((r) => setTimeout(r, 1000));

    // Create a test mint (6 decimals, like USDC)
    mint = await createMint(connection, payer, payer.publicKey, null, 6);

    // Create token accounts for each party
    hedgeTokenAccount = await createAccount(
      connection,
      payer,
      mint,
      hedgeWallet.publicKey
    );
    coverTokenAccount = await createAccount(
      connection,
      payer,
      mint,
      coverWallet.publicKey
    );

    // Fund each party with test tokens
    await mintTo(
      connection,
      payer,
      mint,
      hedgeTokenAccount,
      payer,
      10_000_000 // 10 USDC
    );
    await mintTo(
      connection,
      payer,
      mint,
      coverTokenAccount,
      payer,
      10_000_000
    );
  });

  // ─── create_order ──────────────────────────────────────────────────────────

  describe("create_order", () => {
    it("creates a Hedge order and locks the premium in escrow", async () => {
      const [hedgeOrder] = orderPda(hedgeWallet.publicKey, HEDGE_NONCE);
      const [hedgeEscrow] = escrowPda(hedgeOrder);

      await program.methods
        .createOrder(
          HEDGE_NONCE,
          { hedge: {} },
          INDEX_NAME,
          INDEX_LEVEL,
          COVERAGE,
          HEDGE_PREMIUM,
          expiration(),
          DENOMINATION
        )
        .accounts({
          order: hedgeOrder,
          escrow: hedgeEscrow,
          ownerTokenAccount: hedgeTokenAccount,
          mint,
          owner: hedgeWallet.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([hedgeWallet])
        .rpc();

      // Escrow should hold the premium
      const escrowInfo = await getAccount(connection, hedgeEscrow);
      assert.equal(
        escrowInfo.amount.toString(),
        HEDGE_PREMIUM.toString(),
        "Hedge escrow should hold the premium"
      );

      // Order account state
      const order = await program.account.order.fetch(hedgeOrder);
      assert.deepEqual(order.orderType, { hedge: {} });
      assert.deepEqual(order.status, { open: {} });
      assert.equal(order.coverage.toString(), COVERAGE.toString());
      assert.equal(order.hedgePremium.toString(), HEDGE_PREMIUM.toString());
    });

    it("creates a Cover order and locks coverage in escrow", async () => {
      const [coverOrder] = orderPda(coverWallet.publicKey, COVER_NONCE);
      const [coverEscrow] = escrowPda(coverOrder);

      await program.methods
        .createOrder(
          COVER_NONCE,
          { cover: {} },
          INDEX_NAME,
          INDEX_LEVEL,
          COVERAGE,
          HEDGE_PREMIUM,
          expiration(),
          DENOMINATION
        )
        .accounts({
          order: coverOrder,
          escrow: coverEscrow,
          ownerTokenAccount: coverTokenAccount,
          mint,
          owner: coverWallet.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([coverWallet])
        .rpc();

      // Escrow should hold the coverage
      const escrowInfo = await getAccount(connection, coverEscrow);
      assert.equal(
        escrowInfo.amount.toString(),
        COVERAGE.toString(),
        "Cover escrow should hold the coverage"
      );

      const order = await program.account.order.fetch(coverOrder);
      assert.deepEqual(order.orderType, { cover: {} });
      assert.deepEqual(order.status, { open: {} });
    });
  });

  // ─── match_order ──────────────────────────────────────────────────────────

  describe("match_order", () => {
    it("matches hedge and cover orders, creates contract", async () => {
      const [hedgeOrder] = orderPda(hedgeWallet.publicKey, HEDGE_NONCE);
      const [coverOrder] = orderPda(coverWallet.publicKey, COVER_NONCE);
      const [hedgeEscrow] = escrowPda(hedgeOrder);
      const [coverEscrow] = escrowPda(coverOrder);
      const [contract] = contractPda(hedgeOrder, coverOrder);
      const [contractEscrow] = contractEscrowPda(contract);

      const coverBalanceBefore = (await getAccount(connection, coverTokenAccount))
        .amount;

      await program.methods
        .matchOrder()
        .accounts({
          contract,
          contractEscrow,
          hedgeOrder,
          coverOrder,
          hedgeEscrow,
          coverEscrow,
          coverOwnerTokenAccount: coverTokenAccount,
          hedgeOwnerTokenAccount: hedgeTokenAccount,
          mint,
          matcher: payer.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      // Cover party should have received the premium
      const coverBalanceAfter = (await getAccount(connection, coverTokenAccount))
        .amount;
      assert.equal(
        (coverBalanceAfter - coverBalanceBefore).toString(),
        HEDGE_PREMIUM.toString(),
        "Cover party should receive the premium at match"
      );

      // Contract escrow should hold the coverage
      const contractEscrowInfo = await getAccount(connection, contractEscrow);
      assert.equal(
        contractEscrowInfo.amount.toString(),
        COVERAGE.toString(),
        "Contract escrow should hold the coverage"
      );

      // Orders marked as Matched
      const hOrder = await program.account.order.fetch(hedgeOrder);
      const cOrder = await program.account.order.fetch(coverOrder);
      assert.deepEqual(hOrder.status, { matched: {} });
      assert.deepEqual(cOrder.status, { matched: {} });

      // Contract account created
      const ct = await program.account.contract.fetch(contract);
      assert.isNull(ct.outcome);
      assert.equal(
        ct.hedgeTokenAccount.toBase58(),
        hedgeTokenAccount.toBase58()
      );
      assert.equal(
        ct.coverTokenAccount.toBase58(),
        coverTokenAccount.toBase58()
      );
    });
  });

  // ─── settle ───────────────────────────────────────────────────────────────

  describe("settle", () => {
    // We create a fresh set of orders for each settle test so tests are independent.

    async function setupMatchedContract(
      hedgeNonce: BN,
      coverNonce: BN
    ): Promise<{
      contract: PublicKey;
      contractEscrow: PublicKey;
    }> {
      const [hedgeOrder] = orderPda(hedgeWallet.publicKey, hedgeNonce);
      const [coverOrder] = orderPda(coverWallet.publicKey, coverNonce);
      const [hedgeEscrow] = escrowPda(hedgeOrder);
      const [coverEscrow] = escrowPda(coverOrder);
      const [contract] = contractPda(hedgeOrder, coverOrder);
      const [contractEscrow] = contractEscrowPda(contract);

      // Create hedge order
      await program.methods
        .createOrder(
          hedgeNonce,
          { hedge: {} },
          INDEX_NAME,
          INDEX_LEVEL,
          COVERAGE,
          HEDGE_PREMIUM,
          expiration(),
          DENOMINATION
        )
        .accounts({
          order: hedgeOrder,
          escrow: hedgeEscrow,
          ownerTokenAccount: hedgeTokenAccount,
          mint,
          owner: hedgeWallet.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([hedgeWallet])
        .rpc();

      // Create cover order
      await program.methods
        .createOrder(
          coverNonce,
          { cover: {} },
          INDEX_NAME,
          INDEX_LEVEL,
          COVERAGE,
          HEDGE_PREMIUM,
          expiration(),
          DENOMINATION
        )
        .accounts({
          order: coverOrder,
          escrow: coverEscrow,
          ownerTokenAccount: coverTokenAccount,
          mint,
          owner: coverWallet.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([coverWallet])
        .rpc();

      // Match
      await program.methods
        .matchOrder()
        .accounts({
          contract,
          contractEscrow,
          hedgeOrder,
          coverOrder,
          hedgeEscrow,
          coverEscrow,
          coverOwnerTokenAccount: coverTokenAccount,
          hedgeOwnerTokenAccount: hedgeTokenAccount,
          mint,
          matcher: payer.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      return { contract, contractEscrow };
    }

    it("outcome=1: hedge wins, coverage transferred to hedge wallet", async () => {
      const { contract, contractEscrow } = await setupMatchedContract(
        new BN(10),
        new BN(10)
      );

      const hedgeBefore = (await getAccount(connection, hedgeTokenAccount)).amount;

      await program.methods
        .settle(1)
        .accounts({
          contract,
          contractEscrow,
          winnerTokenAccount: hedgeTokenAccount,
          oracle: oracleKeypair.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([oracleKeypair])
        .rpc();

      const hedgeAfter = (await getAccount(connection, hedgeTokenAccount)).amount;
      assert.equal(
        (hedgeAfter - hedgeBefore).toString(),
        COVERAGE.toString(),
        "Hedge party should receive the coverage on outcome=1"
      );

      const ct = await program.account.contract.fetch(contract);
      assert.equal(ct.outcome, 1);
    });

    it("outcome=0: cover wins, coverage returned to cover wallet", async () => {
      const { contract, contractEscrow } = await setupMatchedContract(
        new BN(20),
        new BN(20)
      );

      const coverBefore = (await getAccount(connection, coverTokenAccount)).amount;

      await program.methods
        .settle(0)
        .accounts({
          contract,
          contractEscrow,
          winnerTokenAccount: coverTokenAccount,
          oracle: oracleKeypair.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([oracleKeypair])
        .rpc();

      const coverAfter = (await getAccount(connection, coverTokenAccount)).amount;
      assert.equal(
        (coverAfter - coverBefore).toString(),
        COVERAGE.toString(),
        "Cover party should receive their coverage back on outcome=0"
      );

      const ct = await program.account.contract.fetch(contract);
      assert.equal(ct.outcome, 0);
    });

    it("rejects a second settle on an already-settled contract", async () => {
      const [hedgeOrder] = orderPda(hedgeWallet.publicKey, new BN(10));
      const [coverOrder] = orderPda(coverWallet.publicKey, new BN(10));
      const [contract] = contractPda(hedgeOrder, coverOrder);
      const [contractEscrow] = contractEscrowPda(contract);

      try {
        await program.methods
          .settle(0)
          .accounts({
            contract,
            contractEscrow,
            winnerTokenAccount: coverTokenAccount,
            oracle: oracleKeypair.publicKey,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([oracleKeypair])
          .rpc();
        assert.fail("Should have thrown AlreadySettled");
      } catch (err: any) {
        assert.include(err.message, "AlreadySettled");
      }
    });
  });

  // ─── cancel_order ─────────────────────────────────────────────────────────

  describe("cancel_order", () => {
    it("cancels an open order and returns the escrowed collateral", async () => {
      // Create a fresh cover order to cancel
      const cancelNonce = new BN(999);
      const [cancelOrder] = orderPda(coverWallet.publicKey, cancelNonce);
      const [cancelEscrow] = escrowPda(cancelOrder);

      await program.methods
        .createOrder(
          cancelNonce,
          { cover: {} },
          INDEX_NAME,
          INDEX_LEVEL,
          COVERAGE,
          HEDGE_PREMIUM,
          expiration(),
          DENOMINATION
        )
        .accounts({
          order: cancelOrder,
          escrow: cancelEscrow,
          ownerTokenAccount: coverTokenAccount,
          mint,
          owner: coverWallet.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([coverWallet])
        .rpc();

      const balanceBefore = (await getAccount(connection, coverTokenAccount)).amount;

      await program.methods
        .cancelOrder()
        .accounts({
          order: cancelOrder,
          escrow: cancelEscrow,
          ownerTokenAccount: coverTokenAccount,
          owner: coverWallet.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([coverWallet])
        .rpc();

      const balanceAfter = (await getAccount(connection, coverTokenAccount)).amount;
      assert.equal(
        (balanceAfter - balanceBefore).toString(),
        COVERAGE.toString(),
        "Cancel should return the locked coverage"
      );

      // Order account should be closed
      const orderInfo = await connection.getAccountInfo(cancelOrder);
      assert.isNull(orderInfo, "Order account should be closed after cancel");
    });

    it("rejects cancel by a non-owner", async () => {
      const nonce = new BN(998);
      const [order] = orderPda(hedgeWallet.publicKey, nonce);
      const [escrow] = escrowPda(order);

      await program.methods
        .createOrder(
          nonce,
          { hedge: {} },
          INDEX_NAME,
          INDEX_LEVEL,
          COVERAGE,
          HEDGE_PREMIUM,
          expiration(),
          DENOMINATION
        )
        .accounts({
          order,
          escrow,
          ownerTokenAccount: hedgeTokenAccount,
          mint,
          owner: hedgeWallet.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([hedgeWallet])
        .rpc();

      try {
        await program.methods
          .cancelOrder()
          .accounts({
            order,
            escrow,
            ownerTokenAccount: coverTokenAccount,
            owner: coverWallet.publicKey,  // wrong signer
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([coverWallet])
          .rpc();
        assert.fail("Should have thrown Unauthorized");
      } catch (err: any) {
        assert.include(err.message, "Unauthorized");
      }
    });
  });
});
