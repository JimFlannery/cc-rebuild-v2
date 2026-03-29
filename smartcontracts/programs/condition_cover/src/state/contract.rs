use anchor_lang::prelude::*;

/// On-chain state for a matched contract between a Hedge order and a Cover order.
///
/// Created by `match_order` when a Hedge and Cover are paired.
/// Settled by `settle` (oracle-signed) with outcome 0 or 1.
#[account]
pub struct Contract {
    /// Pubkey of the hedge Order account.
    pub hedge_order: Pubkey,
    /// Pubkey of the cover Order account.
    pub cover_order: Pubkey,
    /// Token account that receives escrowed funds if the hedge party wins (outcome = 1).
    pub hedge_token_account: Pubkey,
    /// Token account that receives escrowed funds if the cover party wins (outcome = 0).
    pub cover_token_account: Pubkey,
    /// Unix timestamp (seconds) after which the contract expires unsettled.
    pub expiration: i64,
    /// Settlement outcome.
    /// None  = not yet settled.
    /// Some(1) = hedge party wins (index threshold was crossed).
    /// Some(0) = cover party wins (contract expired without threshold crossing).
    pub outcome: Option<u8>,
    /// PDA bump seed for the Contract account — used to sign CPIs from this PDA.
    pub bump: u8,
    /// PDA bump for the contract escrow token account (seeds: [b"contract_escrow", contract]).
    /// Stored so `settle` can reconstruct the escrow signer without extra accounts.
    pub escrow_bump: u8,
}

impl Contract {
    /// Account size including the 8-byte Anchor discriminator.
    ///
    /// Note: 11 bytes are reserved here for the future optimistic oracle fields
    /// (proposed_outcome: Option<u8> = 2, dispute_deadline: i64 = 8, disputed: bool = 1).
    /// Do not use those bytes until the optimistic oracle is implemented post-devnet.
    pub const LEN: usize = 8    // Anchor discriminator
        + 32   // hedge_order
        + 32   // cover_order
        + 32   // hedge_token_account
        + 32   // cover_token_account
        + 8    // expiration (i64)
        + 2    // outcome (Option<u8>: 1-byte tag + 1-byte value)
        + 1    // bump
        + 1    // escrow_bump
        + 11;  // reserved for optimistic oracle fields (post-devnet)
               // Total: 159 bytes
}
