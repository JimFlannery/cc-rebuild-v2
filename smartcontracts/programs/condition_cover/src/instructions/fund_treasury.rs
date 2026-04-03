use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::constants::ADMIN_AUTHORITY;
use crate::errors::ConditionCoverError;
use crate::state::treasury::Treasury;

/// Accounts for the `fund_treasury` instruction.
#[derive(Accounts)]
pub struct FundTreasury<'info> {
    /// The Treasury PDA — receives the accounting update.
    #[account(
        mut,
        seeds = [b"treasury"],
        bump = treasury.bump,
    )]
    pub treasury: Account<'info, Treasury>,

    /// The SSTM escrow that holds the treasury pool.
    #[account(
        mut,
        seeds = [b"treasury_escrow"],
        bump = treasury.escrow_bump,
    )]
    pub treasury_escrow: Account<'info, TokenAccount>,

    /// Admin's SSTM token account — source of the deposit.
    #[account(
        mut,
        token::mint = treasury.sstm_mint,
        token::authority = admin,
    )]
    pub admin_token_account: Account<'info, TokenAccount>,

    /// Admin wallet — must be ADMIN_AUTHORITY.
    #[account(
        mut,
        constraint = admin.key() == ADMIN_AUTHORITY @ ConditionCoverError::Unauthorized,
    )]
    pub admin: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

/// Admin deposits SSTM into the treasury rewards pool.
///
/// `amount` is in SSTM token base units (6 decimals, so 1 SSTM = 1_000_000 units).
pub fn handler(ctx: Context<FundTreasury>, amount: u64) -> Result<()> {
    require!(amount > 0, ConditionCoverError::InvalidAmount);

    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.admin_token_account.to_account_info(),
                to: ctx.accounts.treasury_escrow.to_account_info(),
                authority: ctx.accounts.admin.to_account_info(),
            },
        ),
        amount,
    )?;

    ctx.accounts.treasury.total_funded =
        ctx.accounts.treasury.total_funded.saturating_add(amount);

    msg!(
        "FundTreasury: amount={} total_funded={}",
        amount,
        ctx.accounts.treasury.total_funded,
    );

    Ok(())
}
