use anchor_lang::prelude::*;

use crate::errors::ConditionCoverError;
use crate::state::loop_set::{LoopSet, LoopSetStatus};
use crate::state::order::{Denomination, Order, OrderStatus, OrderType};

/// Accounts for `create_loop_set`.
///
/// Called by User2 (the matcher) when they agree to match User1's seed orders.
/// Both users must have already created their four seed orders via `create_order`:
///   - user1_cover_order: User1 as Cover (index, level, coverage, premium)
///   - user1_hedge_order: User1 as Hedge (same params, offsetting)
///   - user2_hedge_order: User2 as Hedge matching user1_cover_order
///   - user2_cover_order: User2 as Cover matching user1_hedge_order
///
/// This instruction validates the order set, creates the LoopSet PDA, and sets
/// status to Pending. The caller then proceeds to call `match_order` twice
/// (for the A-pair and B-pair) and `register_loop_contract` twice, which
/// transitions the LoopSet to Active.
#[derive(Accounts)]
#[instruction(nonce: u64)]
pub struct CreateLoopSet<'info> {
    /// The LoopSet PDA.
    /// seeds = [b"loop_set", user1, user2, &nonce.to_le_bytes()]
    #[account(
        init,
        payer = creator,
        space = LoopSet::LEN,
        seeds = [
            b"loop_set",
            user1_cover_order.owner.as_ref(),
            creator.key().as_ref(),
            &nonce.to_le_bytes(),
        ],
        bump,
    )]
    pub loop_set: Box<Account<'info, LoopSet>>,

    /// User1's Cover order — the seed order User1 placed on the marketplace.
    /// Must be: OrderType::Cover, Status::Open, Denomination::Sstm.
    #[account(
        constraint = user1_cover_order.order_type == OrderType::Cover   @ ConditionCoverError::OrderTypeMismatch,
        constraint = user1_cover_order.status == OrderStatus::Open       @ ConditionCoverError::OrderNotOpen,
        constraint = user1_cover_order.denomination == Denomination::Sstm @ ConditionCoverError::DenominationMismatch,
    )]
    pub user1_cover_order: Box<Account<'info, Order>>,

    /// User1's Hedge order — the offsetting order User1 placed.
    /// Must match user1_cover_order (same index, level, coverage, premium).
    #[account(
        constraint = user1_hedge_order.order_type == OrderType::Hedge                   @ ConditionCoverError::OrderTypeMismatch,
        constraint = user1_hedge_order.status == OrderStatus::Open                       @ ConditionCoverError::OrderNotOpen,
        constraint = user1_hedge_order.owner == user1_cover_order.owner                  @ ConditionCoverError::Unauthorized,
        constraint = user1_hedge_order.index_name == user1_cover_order.index_name        @ ConditionCoverError::IndexMismatch,
        constraint = user1_hedge_order.index_level == user1_cover_order.index_level      @ ConditionCoverError::IndexMismatch,
        constraint = user1_hedge_order.coverage == user1_cover_order.coverage            @ ConditionCoverError::AmountMismatch,
        constraint = user1_hedge_order.hedge_premium == user1_cover_order.hedge_premium  @ ConditionCoverError::AmountMismatch,
        constraint = user1_hedge_order.denomination == Denomination::Sstm                @ ConditionCoverError::DenominationMismatch,
        constraint = user1_hedge_order.mint == user1_cover_order.mint                    @ ConditionCoverError::DenominationMismatch,
    )]
    pub user1_hedge_order: Box<Account<'info, Order>>,

    /// User2's Hedge order — matches user1_cover_order.
    #[account(
        constraint = user2_hedge_order.order_type == OrderType::Hedge                     @ ConditionCoverError::OrderTypeMismatch,
        constraint = user2_hedge_order.status == OrderStatus::Open                         @ ConditionCoverError::OrderNotOpen,
        constraint = user2_hedge_order.owner == creator.key()                              @ ConditionCoverError::Unauthorized,
        constraint = user2_hedge_order.index_name == user1_cover_order.index_name          @ ConditionCoverError::IndexMismatch,
        constraint = user2_hedge_order.index_level == user1_cover_order.index_level        @ ConditionCoverError::IndexMismatch,
        constraint = user2_hedge_order.coverage == user1_cover_order.coverage              @ ConditionCoverError::AmountMismatch,
        constraint = user2_hedge_order.hedge_premium == user1_cover_order.hedge_premium    @ ConditionCoverError::AmountMismatch,
        constraint = user2_hedge_order.denomination == Denomination::Sstm                  @ ConditionCoverError::DenominationMismatch,
        constraint = user2_hedge_order.mint == user1_cover_order.mint                      @ ConditionCoverError::DenominationMismatch,
    )]
    pub user2_hedge_order: Box<Account<'info, Order>>,

    /// User2's Cover order — matches user1_hedge_order.
    #[account(
        constraint = user2_cover_order.order_type == OrderType::Cover                     @ ConditionCoverError::OrderTypeMismatch,
        constraint = user2_cover_order.status == OrderStatus::Open                         @ ConditionCoverError::OrderNotOpen,
        constraint = user2_cover_order.owner == creator.key()                              @ ConditionCoverError::Unauthorized,
        constraint = user2_cover_order.index_name == user1_cover_order.index_name          @ ConditionCoverError::IndexMismatch,
        constraint = user2_cover_order.index_level == user1_cover_order.index_level        @ ConditionCoverError::IndexMismatch,
        constraint = user2_cover_order.coverage == user1_cover_order.coverage              @ ConditionCoverError::AmountMismatch,
        constraint = user2_cover_order.hedge_premium == user1_cover_order.hedge_premium    @ ConditionCoverError::AmountMismatch,
        constraint = user2_cover_order.denomination == Denomination::Sstm                  @ ConditionCoverError::DenominationMismatch,
        constraint = user2_cover_order.mint == user1_cover_order.mint                      @ ConditionCoverError::DenominationMismatch,
    )]
    pub user2_cover_order: Box<Account<'info, Order>>,

    /// User2's wallet — the matcher who initiates the LoopSet.
    #[account(mut)]
    pub creator: Signer<'info>,

    pub system_program: Program<'info, System>,
}

/// Create a LoopSet by matching two users' pre-existing seed orders.
///
/// Parameters:
///   `nonce`          — uniqueness seed for the LoopSet PDA.
///   `num_loops`      — number of loan loops (0–10); 0 = initial pair only.
///   `reward_apy_bps` — Cover reward APY in basis points (snapshotted from VariableSettings).
///   `loan_apr_bps`   — Treasury loan APR in basis points.
///   `ltv_bps`        — Loan-to-value ratio in basis points.
///   `fee_bps`        — Platform fee in basis points (informational; collected off-chain in USDC).
///   `expiration`     — Unix timestamp when all contracts in the set expire.
pub fn handler(
    ctx: Context<CreateLoopSet>,
    nonce: u64,
    num_loops: u8,
    reward_apy_bps: u16,
    loan_apr_bps: u16,
    ltv_bps: u16,
    fee_bps: u16,
    expiration: i64,
) -> Result<()> {
    let clock = Clock::get()?;

    require!(
        num_loops <= LoopSet::MAX_LOOPS,
        ConditionCoverError::LoopCountExceeded
    );
    require!(
        expiration > clock.unix_timestamp,
        ConditionCoverError::OrderExpired
    );
    require!(ltv_bps > 0 && ltv_bps < 10_000, ConditionCoverError::InvalidLoopParams);
    require!(loan_apr_bps > 0, ConditionCoverError::InvalidLoopParams);

    let user1 = ctx.accounts.user1_cover_order.owner;
    let user2 = ctx.accounts.creator.key();
    let initial_coverage = ctx.accounts.user1_cover_order.coverage;

    // Calculate total loans that will be issued per user across all loops.
    // total = initial × (LTV + LTV² + … + LTV^num_loops)
    let mut total_loaned_per_user: u64 = 0;
    let mut loop_amount = initial_coverage;
    for _ in 1..=num_loops {
        loop_amount = loop_amount
            .saturating_mul(ltv_bps as u64)
            .saturating_div(10_000);
        total_loaned_per_user = total_loaned_per_user.saturating_add(loop_amount);
    }

    let duration_secs = expiration.saturating_sub(clock.unix_timestamp);
    let total_interest_per_user = LoopSet::calc_interest_per_user(
        total_loaned_per_user,
        loan_apr_bps,
        duration_secs,
    );

    let loop_set = &mut ctx.accounts.loop_set;
    loop_set.user1 = user1;
    loop_set.user2 = user2;
    loop_set.status = LoopSetStatus::Pending;
    loop_set.num_loops = num_loops;
    loop_set.loops_deployed = 0;
    loop_set.sstm_mint = ctx.accounts.user1_cover_order.mint;
    loop_set.reward_apy_bps = reward_apy_bps;
    loop_set.loan_apr_bps = loan_apr_bps;
    loop_set.ltv_bps = ltv_bps;
    loop_set.fee_bps = fee_bps;
    loop_set.initial_coverage = initial_coverage;
    loop_set.total_loaned_per_user = total_loaned_per_user;
    loop_set.total_interest_per_user = total_interest_per_user;
    loop_set.expiration = expiration;
    loop_set.nonce = nonce;
    loop_set.bump = ctx.bumps.loop_set;
    loop_set.contracts = [Pubkey::default(); 22];
    loop_set.contracts_registered = 0;

    msg!(
        "CreateLoopSet: loop_set={} user1={} user2={} num_loops={} coverage={} total_loaned_per_user={} interest_per_user={}",
        loop_set.key(),
        user1,
        user2,
        num_loops,
        initial_coverage,
        total_loaned_per_user,
        total_interest_per_user,
    );

    Ok(())
}
