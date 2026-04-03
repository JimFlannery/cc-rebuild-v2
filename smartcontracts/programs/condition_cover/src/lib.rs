use anchor_lang::prelude::*;

pub mod constants;
pub mod errors;
pub mod instructions;
pub mod state;

use instructions::cancel_order::*;
use instructions::create_loop_set::*;
use instructions::create_order::*;
use instructions::fund_treasury::*;
use instructions::init_treasury::*;
use instructions::issue_loop_loan::*;
use instructions::match_order::*;
use instructions::register_loop_contract::*;
use instructions::settle::*;
use instructions::settle_loop_set::*;
use state::order::{Denomination, IndexName, OrderType};

declare_id!("5PkPCbdZNFGYVJNjifxgZDGyeaMKmTeWPj4fxhYeeB9K");

#[program]
pub mod condition_cover {
    use super::*;

    // ── Standard order instructions ───────────────────────────────────────────

    /// Create a Hedge or Cover order and lock collateral in a PDA escrow.
    pub fn create_order(
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
        instructions::create_order::handler(
            ctx,
            nonce,
            order_type,
            index_name,
            index_level,
            coverage,
            hedge_premium,
            expiration,
            denomination,
        )
    }

    /// Match a Hedge order with a compatible Cover order to create a live Contract.
    pub fn match_order(ctx: Context<MatchOrder>) -> Result<()> {
        instructions::match_order::handler(ctx)
    }

    /// Cancel an Open order and return escrowed collateral to the owner.
    pub fn cancel_order(ctx: Context<CancelOrder>) -> Result<()> {
        instructions::cancel_order::handler(ctx)
    }

    /// Oracle-signed instruction to settle a contract and pay out the winner.
    /// Only the wallet at `constants::ORACLE_AUTHORITY` may call this.
    pub fn settle(ctx: Context<Settle>, outcome: u8) -> Result<()> {
        instructions::settle::handler(ctx, outcome)
    }

    // ── Yield Boost / Treasury instructions ──────────────────────────────────

    /// One-time admin setup: create the Treasury PDA and its SSTM escrow.
    /// Must be called before any looping activity.
    pub fn init_treasury(ctx: Context<InitTreasury>) -> Result<()> {
        instructions::init_treasury::handler(ctx)
    }

    /// Admin deposits SSTM into the treasury rewards pool.
    pub fn fund_treasury(ctx: Context<FundTreasury>, amount: u64) -> Result<()> {
        instructions::fund_treasury::handler(ctx, amount)
    }

    // ── Yield Boost / LoopSet instructions ───────────────────────────────────

    /// Create a LoopSet from two users' pre-existing seed orders.
    ///
    /// Workflow:
    ///   1. User1 creates a Cover order + a Hedge order via `create_order`.
    ///   2. User2 creates a matching Hedge order + Cover order via `create_order`.
    ///   3. User2 calls `create_loop_set` — validates all four orders and creates
    ///      the LoopSet PDA (status = Pending).
    ///   4. Matcher calls `match_order` twice (A-pair and B-pair).
    ///   5. Matcher calls `register_loop_contract` twice — LoopSet → Active.
    ///   6. For each loan loop k = 1..num_loops:
    ///      a. Call `issue_loop_loan(k)` — treasury loans SSTM to both users.
    ///      b. Both users call `create_order` for their new Cover/Hedge orders.
    ///      c. Matcher calls `match_order` twice.
    ///      d. Matcher calls `register_loop_contract` twice.
    ///   7. Oracle eventually calls `settle` for each contract, then
    ///      `settle_loop_set` to collect interest and close the set.
    pub fn create_loop_set(
        ctx: Context<CreateLoopSet>,
        nonce: u64,
        num_loops: u8,
        reward_apy_bps: u16,
        loan_apr_bps: u16,
        ltv_bps: u16,
        fee_bps: u16,
        expiration: i64,
    ) -> Result<()> {
        instructions::create_loop_set::handler(
            ctx,
            nonce,
            num_loops,
            reward_apy_bps,
            loan_apr_bps,
            ltv_bps,
            fee_bps,
            expiration,
        )
    }

    /// Issue equal SSTM loans from the treasury to both users for one loop iteration.
    /// Must be called in sequence (loop 1, then 2, etc.) after the previous loop's
    /// contracts have been matched and registered.
    pub fn issue_loop_loan(ctx: Context<IssueLoopLoan>, loop_number: u8) -> Result<()> {
        instructions::issue_loop_loan::handler(ctx, loop_number)
    }

    /// Register a newly matched Contract PDA into the LoopSet.
    /// Call once per contract after each `match_order` in the loop sequence.
    /// Automatically transitions the LoopSet from Pending → Active once the
    /// initial contract pair is registered.
    pub fn register_loop_contract(ctx: Context<RegisterLoopContract>) -> Result<()> {
        instructions::register_loop_contract::handler(ctx)
    }

    /// Oracle-signed instruction to finalise a fully deployed LoopSet.
    /// Collects interest payments from both users and marks the set Settled.
    /// Call after all individual contracts in the set have been settled via `settle`.
    pub fn settle_loop_set(
        ctx: Context<SettleLoopSet>,
        interest_user1: u64,
        interest_user2: u64,
    ) -> Result<()> {
        instructions::settle_loop_set::handler(ctx, interest_user1, interest_user2)
    }
}
