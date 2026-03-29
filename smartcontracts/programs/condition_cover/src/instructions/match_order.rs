use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use crate::errors::ConditionCoverError;
use crate::state::contract::Contract;
use crate::state::order::{Order, OrderStatus, OrderType};

/// Accounts for the `match_order` instruction.
///
/// All large `Account<>` types are `Box`-ed to keep this instruction's stack
/// frame under the Solana BPF 4096-byte limit.  Box<Account<T>> derefs
/// transparently, so field access and constraints work identically.
#[derive(Accounts)]
pub struct MatchOrder<'info> {
    /// The Contract PDA: seeds = [b"contract", hedge_order, cover_order].
    #[account(
        init,
        payer = matcher,
        space = Contract::LEN,
        seeds = [b"contract", hedge_order.key().as_ref(), cover_order.key().as_ref()],
        bump,
    )]
    pub contract: Box<Account<'info, Contract>>,

    /// Contract escrow: holds cover coverage until settlement.
    /// seeds = [b"contract_escrow", contract]  authority = contract PDA
    #[account(
        init,
        payer = matcher,
        token::mint = mint,
        token::authority = contract,
        seeds = [b"contract_escrow", contract.key().as_ref()],
        bump,
    )]
    pub contract_escrow: Box<Account<'info, TokenAccount>>,

    /// Hedge order — must be Open, type Hedge, compatible with cover_order.
    #[account(
        mut,
        constraint = hedge_order.order_type == OrderType::Hedge  @ ConditionCoverError::OrderTypeMismatch,
        constraint = hedge_order.status == OrderStatus::Open     @ ConditionCoverError::OrderNotOpen,
        constraint = hedge_order.index_name == cover_order.index_name      @ ConditionCoverError::IndexMismatch,
        constraint = hedge_order.index_level == cover_order.index_level    @ ConditionCoverError::IndexMismatch,
        constraint = hedge_order.denomination == cover_order.denomination   @ ConditionCoverError::DenominationMismatch,
        constraint = hedge_order.mint == cover_order.mint                   @ ConditionCoverError::DenominationMismatch,
        constraint = hedge_order.coverage == cover_order.coverage           @ ConditionCoverError::AmountMismatch,
        constraint = hedge_order.hedge_premium == cover_order.hedge_premium @ ConditionCoverError::AmountMismatch,
    )]
    pub hedge_order: Box<Account<'info, Order>>,

    /// Cover order — must be Open, type Cover.
    #[account(
        mut,
        constraint = cover_order.order_type == OrderType::Cover @ ConditionCoverError::OrderTypeMismatch,
        constraint = cover_order.status == OrderStatus::Open    @ ConditionCoverError::OrderNotOpen,
    )]
    pub cover_order: Box<Account<'info, Order>>,

    /// Hedge escrow — holds the premium; transferred to the cover party at match.
    #[account(
        mut,
        seeds = [b"escrow", hedge_order.key().as_ref()],
        bump = hedge_order.escrow_bump,
    )]
    pub hedge_escrow: Box<Account<'info, TokenAccount>>,

    /// Cover escrow — holds coverage collateral; moved to contract_escrow.
    #[account(
        mut,
        seeds = [b"escrow", cover_order.key().as_ref()],
        bump = cover_order.escrow_bump,
    )]
    pub cover_escrow: Box<Account<'info, TokenAccount>>,

    /// Cover party's token account — receives the hedge premium at match time.
    #[account(
        mut,
        token::mint = mint,
        token::authority = cover_order.owner,
    )]
    pub cover_owner_token_account: Box<Account<'info, TokenAccount>>,

    /// Hedge party's token account — recorded as payout destination if hedge wins.
    #[account(
        token::mint = mint,
        token::authority = hedge_order.owner,
    )]
    pub hedge_owner_token_account: Box<Account<'info, TokenAccount>>,

    /// SPL token mint (must match both orders).
    #[account(constraint = mint.key() == hedge_order.mint @ ConditionCoverError::DenominationMismatch)]
    pub mint: Box<Account<'info, Mint>>,

    /// Wallet paying for the new Contract and contract_escrow accounts.
    #[account(mut)]
    pub matcher: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

/// Pair a Hedge order with a Cover order to create a live Contract.
///
/// Settlement model (zero-sum binary options):
///   At match:  hedge_premium → cover party wallet  (cover earns premium immediately)
///              coverage      → contract_escrow      (locked until settlement)
///   At settle: contract_escrow → hedge wallet  (outcome = 1, hedge wins)
///              contract_escrow → cover wallet  (outcome = 0, cover wins + recovers coverage)
pub fn handler(ctx: Context<MatchOrder>) -> Result<()> {
    let clock = Clock::get()?;

    require!(
        ctx.accounts.hedge_order.expiration > clock.unix_timestamp,
        ConditionCoverError::OrderExpired
    );
    require!(
        ctx.accounts.cover_order.expiration > clock.unix_timestamp,
        ConditionCoverError::OrderExpired
    );

    let hedge_premium = ctx.accounts.hedge_order.hedge_premium;
    let coverage = ctx.accounts.cover_order.coverage;

    // --- Transfer 1: hedge_escrow (premium) → cover party wallet ---
    let hedge_owner_key = ctx.accounts.hedge_order.owner;
    let hedge_nonce_bytes = ctx.accounts.hedge_order.nonce.to_le_bytes();
    let hedge_order_bump = ctx.accounts.hedge_order.bump;
    let hedge_order_seeds: &[&[u8]] = &[
        b"order",
        hedge_owner_key.as_ref(),
        &hedge_nonce_bytes,
        &[hedge_order_bump],
    ];

    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.hedge_escrow.to_account_info(),
                to: ctx.accounts.cover_owner_token_account.to_account_info(),
                authority: ctx.accounts.hedge_order.to_account_info(),
            },
            &[hedge_order_seeds],
        ),
        hedge_premium,
    )?;

    // --- Transfer 2: cover_escrow (coverage) → contract_escrow ---
    let cover_owner_key = ctx.accounts.cover_order.owner;
    let cover_nonce_bytes = ctx.accounts.cover_order.nonce.to_le_bytes();
    let cover_order_bump = ctx.accounts.cover_order.bump;
    let cover_order_seeds: &[&[u8]] = &[
        b"order",
        cover_owner_key.as_ref(),
        &cover_nonce_bytes,
        &[cover_order_bump],
    ];

    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.cover_escrow.to_account_info(),
                to: ctx.accounts.contract_escrow.to_account_info(),
                authority: ctx.accounts.cover_order.to_account_info(),
            },
            &[cover_order_seeds],
        ),
        coverage,
    )?;

    // --- Mark orders as Matched ---
    ctx.accounts.hedge_order.status = OrderStatus::Matched;
    ctx.accounts.cover_order.status = OrderStatus::Matched;

    // --- Initialize Contract account ---
    let expiration = ctx
        .accounts
        .hedge_order
        .expiration
        .min(ctx.accounts.cover_order.expiration);

    let contract = &mut ctx.accounts.contract;
    contract.hedge_order = ctx.accounts.hedge_order.key();
    contract.cover_order = ctx.accounts.cover_order.key();
    contract.hedge_token_account = ctx.accounts.hedge_owner_token_account.key();
    contract.cover_token_account = ctx.accounts.cover_owner_token_account.key();
    contract.expiration = expiration;
    contract.outcome = None;
    contract.bump = ctx.bumps.contract;
    contract.escrow_bump = ctx.bumps.contract_escrow;

    msg!(
        "MatchOrder: contract={} hedge={} cover={} coverage={} premium={}",
        contract.key(),
        contract.hedge_order,
        contract.cover_order,
        coverage,
        hedge_premium,
    );

    Ok(())
}
