use anchor_lang::prelude::*;

/// Global treasury that holds the SSTM rewards pool and issues loans for
/// the Yield Boost looping feature.
///
/// One Treasury account exists per program deployment.
/// PDA seeds: [b"treasury"]
///
/// The companion SSTM escrow token account is a PDA:
/// seeds = [b"treasury_escrow"]  authority = treasury PDA
///
/// Loan lifecycle:
///   1. Admin funds treasury via `fund_treasury`.
///   2. `issue_loop_loan` draws SSTM from the escrow to both users' wallets.
///      total_loaned += amount × 2  (both users receive the same loan amount)
///   3. `settle_loop_set` repays principal + interest back to the escrow.
///      total_repaid += repayment  (includes both users' repayments)
#[account]
pub struct Treasury {
    /// Admin wallet authorized to call `init_treasury` and `fund_treasury`.
    pub authority: Pubkey,
    /// SSTM SPL token mint.
    pub sstm_mint: Pubkey,
    /// Cumulative SSTM deposited by admin (token base units).
    pub total_funded: u64,
    /// Cumulative SSTM loaned out to loop users (token base units).
    /// Counts both users per loan (i.e. increases by 2 × loan_amount per loop).
    pub total_loaned: u64,
    /// Cumulative SSTM repaid to treasury (principal + interest, token base units).
    pub total_repaid: u64,
    /// PDA bump for the Treasury account.
    pub bump: u8,
    /// PDA bump for the companion treasury escrow token account.
    pub escrow_bump: u8,
}

impl Treasury {
    /// Account size including the 8-byte Anchor discriminator.
    pub const LEN: usize = 8   // discriminator
        + 32  // authority
        + 32  // sstm_mint
        + 8   // total_funded
        + 8   // total_loaned
        + 8   // total_repaid
        + 1   // bump
        + 1;  // escrow_bump
              // Total: 98 bytes

    /// Available balance = total_funded − (total_loaned − total_repaid).
    /// Returns 0 rather than underflowing if bookkeeping is ever inconsistent.
    pub fn available_balance(&self) -> u64 {
        let outstanding = self.total_loaned.saturating_sub(self.total_repaid);
        self.total_funded.saturating_sub(outstanding)
    }
}
