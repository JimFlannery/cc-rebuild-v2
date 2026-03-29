use anchor_lang::prelude::*;

pub mod constants;
pub mod errors;
pub mod instructions;
pub mod state;

use instructions::cancel_order::*;
use instructions::create_order::*;
use instructions::match_order::*;
use instructions::settle::*;
use state::order::{Denomination, IndexName, OrderType};

declare_id!("5PkPCbdZNFGYVJNjifxgZDGyeaMKmTeWPj4fxhYeeB9K");

#[program]
pub mod condition_cover {
    use super::*;

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
}
