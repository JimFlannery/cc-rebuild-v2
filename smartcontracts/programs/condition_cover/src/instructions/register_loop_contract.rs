use anchor_lang::prelude::*;

use crate::errors::ConditionCoverError;
use crate::state::contract::Contract;
use crate::state::loop_set::{LoopSet, LoopSetStatus};

/// Accounts for `register_loop_contract`.
///
/// Called after each `match_order` to link the resulting Contract PDA into
/// the LoopSet. The frontend calls this twice per loop (once for the A-contract
/// and once for the B-contract). When `contracts_registered` reaches
/// `(num_loops + 1) × 2`, the LoopSet transitions from Pending → Active.
#[derive(Accounts)]
pub struct RegisterLoopContract<'info> {
    /// The LoopSet — must be Pending or Active (not yet fully deployed).
    #[account(
        mut,
        constraint = loop_set.status == LoopSetStatus::Pending
                  || loop_set.status == LoopSetStatus::Active
            @ ConditionCoverError::LoopSetNotActive,
    )]
    pub loop_set: Account<'info, LoopSet>,

    /// The Contract PDA to register.
    /// Must not already be in the loop_set.contracts array (checked in handler).
    pub contract: Account<'info, Contract>,

    /// Either user1 or user2 — only participants may register contracts.
    #[account(
        constraint = caller.key() == loop_set.user1
                  || caller.key() == loop_set.user2
            @ ConditionCoverError::Unauthorized,
    )]
    pub caller: Signer<'info>,
}

/// Link a newly matched Contract PDA into a LoopSet.
///
/// Automatically transitions the LoopSet from Pending → Active once all
/// initial-pair contracts are registered (i.e. when contracts_registered == 2
/// and num_loops == 0, or at any point when the initial pair is complete).
///
/// Also increments `loops_deployed` when the contracts for a given loop number
/// are both registered.
pub fn handler(ctx: Context<RegisterLoopContract>) -> Result<()> {
    let contract_key = ctx.accounts.contract.key();
    let loop_set = &mut ctx.accounts.loop_set;

    // Guard: no room left.
    require!(
        loop_set.contracts_registered < 22,
        ConditionCoverError::LoopSetFull
    );

    // Guard: not already registered.
    require!(
        !loop_set.contracts.contains(&contract_key),
        ConditionCoverError::ContractAlreadyRegistered
    );

    // Append to the next available slot.
    let slot = loop_set.contracts_registered as usize;
    loop_set.contracts[slot] = contract_key;
    loop_set.contracts_registered += 1;

    // When pairs are fully registered for the current loops_deployed count,
    // increment loops_deployed.
    // Each loop contributes 2 contracts (A-pair and B-pair).
    let expected_contracts_after_current_loop = (loop_set.loops_deployed as u8 + 1) * 2;
    if loop_set.contracts_registered == expected_contracts_after_current_loop {
        loop_set.loops_deployed += 1;
    }

    // Transition Pending → Active once the initial pair (loop 0) is complete.
    if loop_set.status == LoopSetStatus::Pending && loop_set.loops_deployed >= 1 {
        loop_set.status = LoopSetStatus::Active;
    }

    msg!(
        "RegisterLoopContract: loop_set={} contract={} registered={}/{}",
        loop_set.key(),
        contract_key,
        loop_set.contracts_registered,
        (loop_set.num_loops + 1) * 2,
    );

    Ok(())
}
