use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use crate::errors::ConditionCoverError;
use crate::state::order::{Denomination, IndexName, Order, OrderStatus, OrderType};

/// Accounts for the `create_order` instruction.
///
/// Creates an Order PDA and a companion escrow token account, then locks
/// the appropriate collateral:
///   - Hedge orders: lock `hedge_premium`
///   - Cover orders: lock `coverage`
#[derive(Accounts)]
#[instruction(nonce: u64)]
pub struct CreateOrder<'info> {
    /// The Order PDA: seeds = [b"order", owner, nonce].
    #[account(
        init,
        payer = owner,
        space = Order::LEN,
        seeds = [b"order", owner.key().as_ref(), &nonce.to_le_bytes()],
        bump,
    )]
    pub order: Account<'info, Order>,

    /// PDA token account holding the locked collateral.
    /// seeds = [b"escrow", order]
    /// authority = order (so the program can sign transfers during match/settle/cancel)
    #[account(
        init,
        payer = owner,
        token::mint = mint,
        token::authority = order,
        seeds = [b"escrow", order.key().as_ref()],
        bump,
    )]
    pub escrow: Account<'info, TokenAccount>,

    /// Owner's token account — collateral is pulled from here.
    #[account(
        mut,
        token::mint = mint,
        token::authority = owner,
    )]
    pub owner_token_account: Account<'info, TokenAccount>,

    /// SPL token mint (USDC or SSTM).
    pub mint: Account<'info, Mint>,

    /// The wallet creating the order; pays for account rent.
    #[account(mut)]
    pub owner: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

/// Create a new Hedge or Cover order and lock collateral in escrow.
///
/// Parameters:
///   `nonce`        — client-supplied uniqueness seed; must be the first arg (used in PDA seeds).
///   `order_type`   — Hedge or Cover.
///   `index_name`   — which space weather index triggers payout.
///   `index_level`  — threshold (fixed-point ×100; e.g. Kp 5.0 → 500, Dst -120 nT → -12000).
///   `coverage`     — payout amount in token base units.
///   `hedge_premium`— premium amount in token base units.
///   `expiration`   — Unix timestamp; must be in the future.
///   `denomination` — Usdc or Sstm.
pub fn handler(
    ctx: Context<CreateOrder>,
    nonce: u64,
    order_type: OrderType,
    index_name: IndexName,
    index_level: i64,
    coverage: u64,
    hedge_premium: u64,
    expiration: i64,
    denomination: Denomination,
) -> Result<()> {
    let clock = Clock::get()?;
    require!(
        expiration > clock.unix_timestamp,
        ConditionCoverError::OrderExpired
    );
    require!(coverage > 0, ConditionCoverError::InvalidAmount);
    require!(hedge_premium > 0, ConditionCoverError::InvalidAmount);

    // Hedge locks the premium they'll pay; Cover locks the coverage (payout obligation).
    let lock_amount = match order_type {
        OrderType::Hedge => hedge_premium,
        OrderType::Cover => coverage,
    };

    // Transfer collateral from owner → escrow PDA.
    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.owner_token_account.to_account_info(),
                to: ctx.accounts.escrow.to_account_info(),
                authority: ctx.accounts.owner.to_account_info(),
            },
        ),
        lock_amount,
    )?;

    // Persist order state.
    let order = &mut ctx.accounts.order;
    order.order_type = order_type;
    order.index_name = index_name;
    order.index_level = index_level;
    order.denomination = denomination;
    order.coverage = coverage;
    order.hedge_premium = hedge_premium;
    order.expiration = expiration;
    order.owner = ctx.accounts.owner.key();
    order.mint = ctx.accounts.mint.key();
    order.status = OrderStatus::Open;
    order.nonce = nonce;
    order.bump = ctx.bumps.order;
    order.escrow_bump = ctx.bumps.escrow;

    msg!(
        "CreateOrder: owner={} type={} index={:?} level={} coverage={} premium={} nonce={}",
        order.owner,
        match order.order_type {
            OrderType::Hedge => "Hedge",
            OrderType::Cover => "Cover",
        },
        order.index_name,
        order.index_level,
        order.coverage,
        order.hedge_premium,
        order.nonce,
    );

    Ok(())
}
