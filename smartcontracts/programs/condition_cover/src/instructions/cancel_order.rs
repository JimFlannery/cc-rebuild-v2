use anchor_lang::prelude::*;
use anchor_spl::token::{self, CloseAccount, Token, TokenAccount, Transfer};

use crate::errors::ConditionCoverError;
use crate::state::order::{Order, OrderStatus, OrderType};

/// Accounts for the `cancel_order` instruction.
///
/// Cancels an Open order: returns escrowed collateral to the owner and
/// closes both the escrow token account and the Order account (rent returned).
#[derive(Accounts)]
pub struct CancelOrder<'info> {
    /// The Order PDA to cancel.
    /// Constraint: caller must be the owner; order must be Open.
    #[account(
        mut,
        has_one = owner @ ConditionCoverError::Unauthorized,
        constraint = order.status == OrderStatus::Open @ ConditionCoverError::OrderNotOpen,
        close = owner,
    )]
    pub order: Account<'info, Order>,

    /// Escrow token account — drained then closed; rent returned to owner.
    #[account(
        mut,
        seeds = [b"escrow", order.key().as_ref()],
        bump = order.escrow_bump,
    )]
    pub escrow: Account<'info, TokenAccount>,

    /// Owner's token account — receives the returned collateral.
    #[account(
        mut,
        token::mint = order.mint,
        token::authority = owner,
    )]
    pub owner_token_account: Account<'info, TokenAccount>,

    /// The order owner; must sign; receives returned rent lamports.
    #[account(mut)]
    pub owner: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

/// Cancel an Open order and return its escrowed collateral.
///
/// The escrowed amount is:
///   - Hedge orders: `hedge_premium`
///   - Cover orders: `coverage`
pub fn handler(ctx: Context<CancelOrder>) -> Result<()> {
    // Use the actual escrow balance (should equal the locked amount).
    let return_amount = ctx.accounts.escrow.amount;

    let owner_key = ctx.accounts.order.owner;
    let nonce_bytes = ctx.accounts.order.nonce.to_le_bytes();
    let order_bump = ctx.accounts.order.bump;

    let order_seeds: &[&[u8]] = &[
        b"order",
        owner_key.as_ref(),
        &nonce_bytes,
        &[order_bump],
    ];

    // Transfer tokens from escrow back to the owner.
    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.escrow.to_account_info(),
                to: ctx.accounts.owner_token_account.to_account_info(),
                authority: ctx.accounts.order.to_account_info(),
            },
            &[order_seeds],
        ),
        return_amount,
    )?;

    // Close the escrow token account (zero balance now) and return its rent lamports.
    // The Order PDA is the authority over the escrow, so we sign with order_seeds.
    token::close_account(CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        CloseAccount {
            account: ctx.accounts.escrow.to_account_info(),
            destination: ctx.accounts.owner.to_account_info(),
            authority: ctx.accounts.order.to_account_info(),
        },
        &[order_seeds],
    ))?;

    let order_type_str = match ctx.accounts.order.order_type {
        OrderType::Hedge => "Hedge",
        OrderType::Cover => "Cover",
    };
    msg!(
        "CancelOrder: owner={} type={} returned={}",
        owner_key,
        order_type_str,
        return_amount,
    );

    // The Order account itself is closed by the `close = owner` constraint above.

    Ok(())
}
