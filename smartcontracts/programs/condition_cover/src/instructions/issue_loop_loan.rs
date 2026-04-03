use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use crate::errors::ConditionCoverError;
use crate::state::loop_set::{LoopSet, LoopSetStatus};
use crate::state::treasury::Treasury;

/// Accounts for `issue_loop_loan`.
///
/// Permissionless — either user or a platform crank may call this.
/// Issues equal SSTM loans from the treasury to both User1 and User2 for the
/// specified loop iteration, so each user can create their Cover orders for
/// that loop via `create_order`.
///
/// Loan amount = initial_coverage × LTV^loop_number
/// Must be called in order: loop 1 before loop 2, etc.
#[derive(Accounts)]
#[instruction(loop_number: u8)]
pub struct IssueLoopLoan<'info> {
    /// The LoopSet — must be Active; loop_number must equal loops_deployed.
    #[account(
        mut,
        constraint = loop_set.status == LoopSetStatus::Active @ ConditionCoverError::LoopSetNotActive,
        constraint = loop_number == loop_set.loops_deployed    @ ConditionCoverError::LoopNumberMismatch,
        constraint = loop_number > 0                           @ ConditionCoverError::InvalidLoopParams,
        constraint = loop_number <= loop_set.num_loops         @ ConditionCoverError::LoopCountExceeded,
    )]
    pub loop_set: Box<Account<'info, LoopSet>>,

    /// Treasury PDA — validated by seeds; updated for loan accounting.
    #[account(
        mut,
        seeds = [b"treasury"],
        bump = treasury.bump,
        constraint = treasury.sstm_mint == loop_set.sstm_mint @ ConditionCoverError::DenominationMismatch,
    )]
    pub treasury: Box<Account<'info, Treasury>>,

    /// Treasury SSTM escrow — source of the loan funds.
    #[account(
        mut,
        seeds = [b"treasury_escrow"],
        bump = treasury.escrow_bump,
    )]
    pub treasury_escrow: Box<Account<'info, TokenAccount>>,

    /// User1's SSTM token account — receives loan_amount SSTM.
    #[account(
        mut,
        token::mint = sstm_mint,
        token::authority = loop_set.user1,
    )]
    pub user1_token_account: Box<Account<'info, TokenAccount>>,

    /// User2's SSTM token account — receives loan_amount SSTM.
    #[account(
        mut,
        token::mint = sstm_mint,
        token::authority = loop_set.user2,
    )]
    pub user2_token_account: Box<Account<'info, TokenAccount>>,

    /// SSTM mint — validated against the LoopSet.
    pub sstm_mint: Account<'info, Mint>,

    /// Any signer may submit this permissionless instruction.
    pub caller: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

/// Issue equal SSTM loans from the treasury to both users for the given loop.
///
/// `loop_number` must equal the current `loop_set.loops_deployed` (i.e. called
/// in strict sequence: call for loop 1, then register its contracts, then call
/// for loop 2, etc.).
pub fn handler(ctx: Context<IssueLoopLoan>, loop_number: u8) -> Result<()> {
    let loan_amount = ctx.accounts.loop_set.loan_amount_for_loop(loop_number);
    require!(loan_amount > 0, ConditionCoverError::InvalidAmount);

    // Ensure treasury has enough balance for both users (2 × loan_amount).
    let total_outflow = loan_amount.saturating_mul(2);
    require!(
        ctx.accounts.treasury.available_balance() >= total_outflow,
        ConditionCoverError::InsufficientTreasuryBalance
    );

    let treasury_bump = ctx.accounts.treasury.bump;
    let signer_seeds: &[&[u8]] = &[b"treasury", &[treasury_bump]];

    // Transfer loan_amount to User1.
    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.treasury_escrow.to_account_info(),
                to: ctx.accounts.user1_token_account.to_account_info(),
                authority: ctx.accounts.treasury.to_account_info(),
            },
            &[signer_seeds],
        ),
        loan_amount,
    )?;

    // Transfer loan_amount to User2.
    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.treasury_escrow.to_account_info(),
                to: ctx.accounts.user2_token_account.to_account_info(),
                authority: ctx.accounts.treasury.to_account_info(),
            },
            &[signer_seeds],
        ),
        loan_amount,
    )?;

    // Update treasury loan accounting.
    ctx.accounts.treasury.total_loaned = ctx
        .accounts
        .treasury
        .total_loaned
        .saturating_add(total_outflow);

    msg!(
        "IssueLoopLoan: loop_set={} loop={} loan_amount={} user1={} user2={} treasury_loaned_total={}",
        ctx.accounts.loop_set.key(),
        loop_number,
        loan_amount,
        ctx.accounts.loop_set.user1,
        ctx.accounts.loop_set.user2,
        ctx.accounts.treasury.total_loaned,
    );

    Ok(())
}
