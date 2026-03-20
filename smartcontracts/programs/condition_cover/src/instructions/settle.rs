use anchor_lang::prelude::*;

use crate::constants::ORACLE_AUTHORITY;
use crate::errors::ConditionCoverError;
use crate::state::contract::Contract;

/// Accounts required by the `settle` instruction.
#[derive(Accounts)]
pub struct Settle<'info> {
    /// The contract being settled.
    /// Constraint: must not already have an outcome recorded.
    #[account(
        mut,
        constraint = contract.outcome.is_none() @ ConditionCoverError::AlreadySettled,
    )]
    pub contract: Account<'info, Contract>,

    /// The oracle wallet signing this transaction.
    /// Constraint: must match the hardcoded ORACLE_AUTHORITY pubkey.
    #[account(
        constraint = oracle.key() == ORACLE_AUTHORITY @ ConditionCoverError::UnauthorizedOracle,
    )]
    pub oracle: Signer<'info>,
}

/// Record the settlement outcome on the Contract account.
///
/// `outcome`:
///   1 → Hedge party wins — the index threshold was crossed.
///   0 → Cover party wins — the contract expired without the threshold being crossed.
///
/// Token transfers (escrow → winner) are not yet implemented here.
/// They will be added in a follow-up once SPL token escrow accounts are wired up.
pub fn handler(ctx: Context<Settle>, outcome: u8) -> Result<()> {
    require!(
        outcome == 0 || outcome == 1,
        ConditionCoverError::InvalidOutcome
    );

    let contract = &mut ctx.accounts.contract;
    contract.outcome = Some(outcome);

    msg!(
        "Settled: hedge_order={} cover_order={} outcome={}",
        contract.hedge_order,
        contract.cover_order,
        outcome,
    );

    // TODO: SPL token transfers
    //   outcome == 1 → transfer escrowed collateral to contract.hedge_token_account
    //   outcome == 0 → transfer escrowed collateral to contract.cover_token_account

    Ok(())
}
