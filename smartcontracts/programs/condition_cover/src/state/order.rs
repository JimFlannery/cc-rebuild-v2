use anchor_lang::prelude::*;

/// Hedge = buying protection; Cover = selling protection (collecting premium).
#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum OrderType {
    Hedge,
    Cover,
}

/// Space weather indices supported as contract triggers.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, Debug)]
pub enum IndexName {
    Kp,
    Dst,
    SolarXRayFlux,
    SolarProtonFlux,
    SolarRadioFlux,
}

/// SPL token used to denominate the contract.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum Denomination {
    Usdc,
    Sstm,
}

/// Lifecycle state of an order.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum OrderStatus {
    Open,
    Matched,
    Settled,
    Cancelled,
}

/// On-chain state for a hedge or cover order.
///
/// Created by `create_order`; paired with `match_order`; cancelled with `cancel_order`.
/// A PDA token escrow account (seeds: [b"escrow", order.key()]) holds the locked collateral.
///
/// Hedge orders lock `hedge_premium` in escrow.
/// Cover orders lock `coverage` in escrow.
#[account]
pub struct Order {
    /// Hedge or Cover.
    pub order_type: OrderType,
    /// Space weather index this order is based on.
    pub index_name: IndexName,
    /// Payout threshold stored as fixed-point ×100.
    /// Examples: Kp 5.0 → 500; Dst -120 nT → -12000.
    pub index_level: i64,
    /// Token denomination (USDC or SSTM).
    pub denomination: Denomination,
    /// Maximum payout / collateral amount in token base units.
    /// Hedge: receives this if the index threshold is crossed.
    /// Cover: locks this as their payout obligation.
    pub coverage: u64,
    /// Premium the hedge party pays to buy protection.
    /// Locked in escrow for Hedge orders; received at match time by Cover party.
    pub hedge_premium: u64,
    /// Unix timestamp after which this order can no longer be matched.
    pub expiration: i64,
    /// Wallet that created this order.
    pub owner: Pubkey,
    /// SPL token mint (USDC or SSTM mint address).
    pub mint: Pubkey,
    /// Current lifecycle status.
    pub status: OrderStatus,
    /// Client-supplied nonce — enables multiple open orders per owner.
    /// Incorporated into the PDA seeds: [b"order", owner, nonce].
    pub nonce: u64,
    /// PDA bump for the Order account itself.
    pub bump: u8,
    /// PDA bump for the associated escrow token account (seeds: [b"escrow", order]).
    pub escrow_bump: u8,
}

impl Order {
    /// Account size including the 8-byte Anchor discriminator.
    pub const LEN: usize = 8  // discriminator
        + 1  // order_type  (enum variant)
        + 1  // index_name  (enum variant)
        + 8  // index_level (i64)
        + 1  // denomination (enum variant)
        + 8  // coverage    (u64)
        + 8  // hedge_premium (u64)
        + 8  // expiration  (i64)
        + 32 // owner       (Pubkey)
        + 32 // mint        (Pubkey)
        + 1  // status      (enum variant)
        + 8  // nonce       (u64)
        + 1  // bump        (u8)
        + 1; // escrow_bump (u8)
             // Total: 118 bytes
}
