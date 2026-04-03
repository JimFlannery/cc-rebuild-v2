use anchor_lang::prelude::*;

/// Lifecycle status of a LoopSet.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum LoopSetStatus {
    /// Created; waiting for initial contract pairs to be registered.
    Pending,
    /// All initial pairs registered; ready for deploy_loop calls.
    Active,
    /// All loops deployed and all contracts settled; loans repaid.
    Settled,
    /// Cancelled before any loops were deployed.
    Cancelled,
}

/// On-chain state for a delta-neutral looping set.
///
/// One LoopSet is created per matched whale pair. It groups all the
/// automatically-generated contract pairs (initial + N loops) and tracks
/// the SSTM treasury loans issued to each user.
///
/// PDA seeds: [b"loop_set", user1, user2, &nonce.to_le_bytes()]
///
/// Contract layout per loop:
///   Loop 0 (initial):  Contract A = User1 Cover ↔ User2 Hedge
///                      Contract B = User2 Cover ↔ User1 Hedge
///   Loop k (k ≥ 1):    Contract A = User1 Cover ↔ User2 Hedge (loaned SSTM)
///                      Contract B = User2 Cover ↔ User1 Hedge (loaned SSTM)
///
/// Both users are always delta neutral: for every contract where User1 is Cover,
/// there is a matching contract where User1 is Hedge with the same terms.
#[account]
pub struct LoopSet {
    /// Cover party on the A-contracts; Hedge party on the B-contracts.
    pub user1: Pubkey,
    /// Hedge party on the A-contracts; Cover party on the B-contracts.
    pub user2: Pubkey,
    /// Lifecycle status.
    pub status: LoopSetStatus,
    /// Total number of loan loops (0 = initial pair only, max 10).
    pub num_loops: u8,
    /// How many loops have been deployed so far (including loop 0).
    pub loops_deployed: u8,
    /// SSTM mint address (all loop contracts must use SSTM).
    pub sstm_mint: Pubkey,

    // ── Rates snapshotted from VariableSettings at creation time ─────────────
    // Stored in basis points (bps) to avoid floating-point on-chain.
    // 1 bps = 0.01 %; 10000 bps = 100 %.
    /// Cover party reward APY in bps (e.g. 1700 = 17.00 %).
    pub reward_apy_bps: u16,
    /// Annual interest rate on treasury loans in bps (e.g. 750 = 7.50 %).
    pub loan_apr_bps: u16,
    /// Loan-to-value ratio in bps (e.g. 6700 = 67.00 %).
    pub ltv_bps: u16,
    /// Platform fee in bps (e.g. 100 = 1.00 %, paid upfront in USDC off-chain).
    pub fee_bps: u16,

    // ── Coverage & loan tracking ─────────────────────────────────────────────
    /// Initial coverage each user provided (SSTM token base units).
    pub initial_coverage: u64,
    /// Total SSTM loaned from treasury to each user across all loops.
    /// Doubles the actual treasury outflow since both users receive equal loans.
    pub total_loaned_per_user: u64,
    /// Interest each user owes at settlement (calculated at LoopSet creation;
    /// interest = total_loaned_per_user * loan_apr_bps / 10000 * duration / 365).
    pub total_interest_per_user: u64,

    /// Unix timestamp when all contracts in this set expire.
    pub expiration: i64,
    /// Client-supplied nonce — allows multiple LoopSets per user pair.
    pub nonce: u64,
    /// PDA bump for this account.
    pub bump: u8,

    // ── Contract registry ────────────────────────────────────────────────────
    // Stores up to 22 contract PDAs (11 pairs × 2 contracts per pair).
    // contracts[2k]     = A-contract for loop k  (User1 Cover, User2 Hedge)
    // contracts[2k + 1] = B-contract for loop k  (User2 Cover, User1 Hedge)
    // Unregistered slots are Pubkey::default().
    /// Registered contract PDAs in pair order.
    pub contracts: [Pubkey; 22],
    /// How many contract PDAs have been registered so far.
    pub contracts_registered: u8,
}

impl LoopSet {
    /// Maximum number of loops (initial pair + 10 loan loops = 11 pairs = 22 contracts).
    pub const MAX_LOOPS: u8 = 10;

    /// Account size including the 8-byte Anchor discriminator.
    pub const LEN: usize = 8    // discriminator
        + 32   // user1
        + 32   // user2
        + 1    // status  (enum variant)
        + 1    // num_loops
        + 1    // loops_deployed
        + 32   // sstm_mint
        + 2    // reward_apy_bps
        + 2    // loan_apr_bps
        + 2    // ltv_bps
        + 2    // fee_bps
        + 8    // initial_coverage
        + 8    // total_loaned_per_user
        + 8    // total_interest_per_user
        + 8    // expiration
        + 8    // nonce
        + 1    // bump
        + 22 * 32  // contracts array (22 × Pubkey)
        + 1;   // contracts_registered
               // Total: 861 bytes

    /// Calculate the loan amount for a given loop iteration.
    ///
    /// Loop 0 = initial pair (no loan needed; users provide their own coverage).
    /// Loop k (k ≥ 1) = initial_coverage × LTV^k
    ///
    /// Returns the loan amount in SSTM token base units.
    pub fn loan_amount_for_loop(&self, loop_number: u8) -> u64 {
        if loop_number == 0 {
            return 0;
        }
        // ltv = ltv_bps / 10_000
        // amount = initial_coverage × (ltv_bps / 10_000)^loop_number
        // Compute in integer arithmetic: scale by 10_000^loop_number.
        let mut amount = self.initial_coverage;
        for _ in 0..loop_number {
            amount = amount
                .saturating_mul(self.ltv_bps as u64)
                .saturating_div(10_000);
        }
        amount
    }

    /// Calculate the expected interest owed per user for the entire loop set
    /// given a contract duration in seconds.
    ///
    /// interest = total_loaned × loan_apr_bps / 10_000 × duration_secs / 31_536_000
    pub fn calc_interest_per_user(
        total_loaned: u64,
        loan_apr_bps: u16,
        duration_secs: i64,
    ) -> u64 {
        // duration_ratio = duration_secs / 31_536_000  (seconds per year)
        (total_loaned as u128)
            .saturating_mul(loan_apr_bps as u128)
            .saturating_mul(duration_secs.unsigned_abs() as u128)
            .saturating_div(10_000)
            .saturating_div(31_536_000)
            .min(u64::MAX as u128) as u64
    }
}
