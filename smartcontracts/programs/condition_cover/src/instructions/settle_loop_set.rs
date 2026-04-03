use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::constants::ORACLE_AUTHORITY;
use crate::errors::ConditionCoverError;
use crate::state::loop_set::{LoopSet, LoopSetStatus};
use crate::state::treasury::Treasury;

/// Accounts for `settle_loop_set`.
///
/// Oracle-signed instruction that:
///   1. Validates all individual contracts in the LoopSet have been settled
///      (checked off-chain by the oracle before calling; on-chain the oracle is trusted).
///   2. Transfers interest payments from both users back to the treasury.
///   3. Marks the LoopSet as Settled.
///
/// Individual contract payouts (coverage to winner) are handled by the existing
/// `settle` instruction called once per contract. This instruction handles only
/// the interest repayment and final LoopSet bookkeeping.
///
/// Interest is owed regardless of individual contract outcomes because both
/// users are delta neutral — their net coverage positions cancel out.
#[derive(Accounts)]
pub struct SettleLoopSet<'info> {
    /// The LoopSet — must be Active and fully deployed.
    #[account(
        mut,
        constraint = loop_set.status == LoopSetStatus::Active @ ConditionCoverError::LoopSetNotActive,
        constraint = loop_set.loops_deployed == loop_set.num_loops + 1
            @ ConditionCoverError::LoopNotFullyDeployed,
    )]
    pub loop_set: Box<Account<'info, LoopSet>>,

    /// Treasury PDA — receives the interest repayments.
    #[account(
        mut,
        seeds = [b"treasury"],
        bump = treasury.bump,
    )]
    pub treasury: Box<Account<'info, Treasury>>,

    /// Treasury SSTM escrow — destination for interest repayments.
    #[account(
        mut,
        seeds = [b"treasury_escrow"],
        bump = treasury.escrow_bump,
    )]
    pub treasury_escrow: Box<Account<'info, TokenAccount>>,

    /// User1's SSTM token account — debited for interest.
    /// User1 must be a co-signer to authorise the debit from their account.
    #[account(
        mut,
        token::mint = treasury.sstm_mint,
        token::authority = user1,
    )]
    pub user1_token_account: Box<Account<'info, TokenAccount>>,

    /// User2's SSTM token account — debited for interest.
    /// User2 must be a co-signer to authorise the debit from their account.
    #[account(
        mut,
        token::mint = treasury.sstm_mint,
        token::authority = user2,
    )]
    pub user2_token_account: Box<Account<'info, TokenAccount>>,

    /// User1 — must sign to authorise the interest debit.
    #[account(constraint = user1.key() == loop_set.user1 @ ConditionCoverError::Unauthorized)]
    pub user1: Signer<'info>,

    /// User2 — must sign to authorise the interest debit.
    #[account(constraint = user2.key() == loop_set.user2 @ ConditionCoverError::Unauthorized)]
    pub user2: Signer<'info>,

    /// The oracle wallet authorised to settle.
    #[account(
        constraint = oracle.key() == ORACLE_AUTHORITY @ ConditionCoverError::UnauthorizedOracle,
    )]
    pub oracle: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

/// Oracle-signed instruction to finalise a LoopSet and collect loan interest.
///
/// Prerequisites (enforced by oracle off-chain before calling):
///   - All `(num_loops + 1) × 2` contracts in the set have been settled via
///     the existing `settle` instruction.
///   - Both users have sufficient SSTM in their token accounts to cover interest.
///
/// The oracle passes the pre-computed interest amounts (in SSTM token base units)
/// rather than re-computing them on-chain, allowing the oracle to handle edge-cases
/// (e.g. rounding, partial interest waivers) without program upgrades.
pub fn handler(
    ctx: Context<SettleLoopSet>,
    interest_user1: u64,
    interest_user2: u64,
) -> Result<()> {
    // Sanity-check: neither interest amount should wildly exceed what was recorded.
    // Allow up to 10% over the stored estimate to accommodate rounding.
    let max_interest = ctx
        .accounts
        .loop_set
        .total_interest_per_user
        .saturating_mul(110)
        .saturating_div(100);
    require!(
        interest_user1 <= max_interest,
        ConditionCoverError::InvalidInterestAmount
    );
    require!(
        interest_user2 <= max_interest,
        ConditionCoverError::InvalidInterestAmount
    );

    // Collect interest from User1 → treasury escrow (User1 signs).
    if interest_user1 > 0 {
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.user1_token_account.to_account_info(),
                    to: ctx.accounts.treasury_escrow.to_account_info(),
                    authority: ctx.accounts.user1.to_account_info(),
                },
            ),
            interest_user1,
        )?;
    }

    // Collect interest from User2 → treasury escrow (User2 signs).
    if interest_user2 > 0 {
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.user2_token_account.to_account_info(),
                    to: ctx.accounts.treasury_escrow.to_account_info(),
                    authority: ctx.accounts.user2.to_account_info(),
                },
            ),
            interest_user2,
        )?;
    }

    // Update treasury repayment accounting.
    // Repaid = principal (loans already transferred back through contract settlements)
    //        + interest collected here.
    let total_principal = ctx
        .accounts
        .loop_set
        .total_loaned_per_user
        .saturating_mul(2);
    let total_interest = interest_user1.saturating_add(interest_user2);
    ctx.accounts.treasury.total_repaid = ctx
        .accounts
        .treasury
        .total_repaid
        .saturating_add(total_principal)
        .saturating_add(total_interest);

    // Mark LoopSet as Settled.
    ctx.accounts.loop_set.status = LoopSetStatus::Settled;

    msg!(
        "SettleLoopSet: loop_set={} interest_user1={} interest_user2={} treasury_repaid_total={}",
        ctx.accounts.loop_set.key(),
        interest_user1,
        interest_user2,
        ctx.accounts.treasury.total_repaid,
    );

    Ok(())
}
