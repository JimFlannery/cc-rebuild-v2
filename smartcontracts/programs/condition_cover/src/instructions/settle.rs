use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::constants::ORACLE_AUTHORITY;
use crate::errors::ConditionCoverError;
use crate::state::contract::Contract;

/// Accounts for the `settle` instruction.
#[derive(Accounts)]
pub struct Settle<'info> {
    /// The contract being settled.
    #[account(
        mut,
        constraint = contract.outcome.is_none() @ ConditionCoverError::AlreadySettled,
    )]
    pub contract: Account<'info, Contract>,

    /// Contract escrow — holds the coverage collateral to be paid to the winner.
    /// seeds = [b"contract_escrow", contract]
    #[account(
        mut,
        seeds = [b"contract_escrow", contract.key().as_ref()],
        bump = contract.escrow_bump,
    )]
    pub contract_escrow: Account<'info, TokenAccount>,

    /// Token account that receives the escrowed payout.
    /// Must equal `contract.hedge_token_account` when outcome = 1 (hedge wins),
    /// or `contract.cover_token_account` when outcome = 0 (cover wins).
    #[account(mut)]
    pub winner_token_account: Account<'info, TokenAccount>,

    /// The oracle wallet signing this transaction.
    #[account(
        constraint = oracle.key() == ORACLE_AUTHORITY @ ConditionCoverError::UnauthorizedOracle,
    )]
    pub oracle: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

/// Oracle-signed instruction to settle a contract.
///
/// `outcome`:
///   1 → Hedge wins — the index threshold was crossed.
///       Escrowed coverage → `contract.hedge_token_account`.
///   0 → Cover wins — the contract expired without the threshold crossing.
///       Escrowed coverage → `contract.cover_token_account`.
///
/// Only `ORACLE_AUTHORITY` may call this.
pub fn handler(ctx: Context<Settle>, outcome: u8) -> Result<()> {
    require!(
        outcome == 0 || outcome == 1,
        ConditionCoverError::InvalidOutcome
    );

    // Verify the winner account matches the on-chain record.
    let expected_winner = if outcome == 1 {
        ctx.accounts.contract.hedge_token_account
    } else {
        ctx.accounts.contract.cover_token_account
    };
    require!(
        ctx.accounts.winner_token_account.key() == expected_winner,
        ConditionCoverError::InvalidWinnerAccount
    );

    let payout_amount = ctx.accounts.contract_escrow.amount;

    // Read data needed for the PDA signer before the mutable borrow.
    let hedge_order_key = ctx.accounts.contract.hedge_order;
    let cover_order_key = ctx.accounts.contract.cover_order;
    let contract_bump = ctx.accounts.contract.bump;

    // Record the outcome on-chain.
    ctx.accounts.contract.outcome = Some(outcome);

    // Sign as the Contract PDA (authority over the contract escrow).
    let signer_seeds: &[&[u8]] = &[
        b"contract",
        hedge_order_key.as_ref(),
        cover_order_key.as_ref(),
        &[contract_bump],
    ];

    // Transfer escrowed collateral to the winner.
    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.contract_escrow.to_account_info(),
                to: ctx.accounts.winner_token_account.to_account_info(),
                authority: ctx.accounts.contract.to_account_info(),
            },
            &[signer_seeds],
        ),
        payout_amount,
    )?;

    msg!(
        "Settled: hedge_order={} cover_order={} outcome={} payout={}",
        hedge_order_key,
        cover_order_key,
        outcome,
        payout_amount,
    );

    Ok(())
}
