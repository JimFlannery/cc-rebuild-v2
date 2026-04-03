use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

use crate::constants::ADMIN_AUTHORITY;
use crate::errors::ConditionCoverError;
use crate::state::treasury::Treasury;

/// Accounts for the `init_treasury` instruction.
///
/// One-time setup by the admin. Creates the Treasury PDA and its companion
/// SSTM escrow token account. Must be called before any looping activity.
#[derive(Accounts)]
pub struct InitTreasury<'info> {
    /// The Treasury PDA.
    /// seeds = [b"treasury"]
    #[account(
        init,
        payer = admin,
        space = Treasury::LEN,
        seeds = [b"treasury"],
        bump,
    )]
    pub treasury: Account<'info, Treasury>,

    /// The SSTM escrow token account owned by the Treasury PDA.
    /// seeds = [b"treasury_escrow"]  authority = treasury PDA
    #[account(
        init,
        payer = admin,
        token::mint = sstm_mint,
        token::authority = treasury,
        seeds = [b"treasury_escrow"],
        bump,
    )]
    pub treasury_escrow: Account<'info, TokenAccount>,

    /// The SSTM token mint.
    pub sstm_mint: Account<'info, Mint>,

    /// Admin wallet — must be ADMIN_AUTHORITY.
    #[account(
        mut,
        constraint = admin.key() == ADMIN_AUTHORITY @ ConditionCoverError::Unauthorized,
    )]
    pub admin: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

/// One-time admin instruction to create the Treasury PDA and SSTM escrow.
pub fn handler(ctx: Context<InitTreasury>) -> Result<()> {
    let treasury = &mut ctx.accounts.treasury;
    treasury.authority = ctx.accounts.admin.key();
    treasury.sstm_mint = ctx.accounts.sstm_mint.key();
    treasury.total_funded = 0;
    treasury.total_loaned = 0;
    treasury.total_repaid = 0;
    treasury.bump = ctx.bumps.treasury;
    treasury.escrow_bump = ctx.bumps.treasury_escrow;

    msg!(
        "InitTreasury: treasury={} escrow={}",
        treasury.key(),
        ctx.accounts.treasury_escrow.key(),
    );

    Ok(())
}
