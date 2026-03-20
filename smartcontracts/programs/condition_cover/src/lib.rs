use anchor_lang::prelude::*;

pub mod constants;
pub mod errors;
pub mod instructions;
pub mod state;

use instructions::settle::*;

declare_id!("5PkPCbdZNFGYVJNjifxgZDGyeaMKmTeWPj4fxhYeeB9K");

#[program]
pub mod condition_cover {
    use super::*;

    /// Oracle-signed instruction to settle a contract.
    /// Only the wallet at constants::ORACLE_AUTHORITY may call this.
    pub fn settle(ctx: Context<Settle>, outcome: u8) -> Result<()> {
        instructions::settle::handler(ctx, outcome)
    }
}
