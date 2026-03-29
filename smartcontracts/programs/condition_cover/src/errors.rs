use anchor_lang::prelude::*;

#[error_code]
pub enum ConditionCoverError {
    // --- Oracle / settlement ---
    #[msg("Signer is not the authorized oracle")]
    UnauthorizedOracle,
    #[msg("Contract has already been settled")]
    AlreadySettled,
    #[msg("Invalid outcome — must be 0 (cover wins) or 1 (hedge wins)")]
    InvalidOutcome,
    #[msg("Winner token account does not match the recorded destination for this outcome")]
    InvalidWinnerAccount,

    // --- Order lifecycle ---
    #[msg("Order expiration must be in the future")]
    OrderExpired,
    #[msg("Coverage amount must be greater than zero")]
    InvalidAmount,
    #[msg("Order is not in Open status")]
    OrderNotOpen,
    #[msg("Caller is not the order owner")]
    Unauthorized,

    // --- Matching ---
    #[msg("Orders must be one Hedge and one Cover")]
    OrderTypeMismatch,
    #[msg("Orders have different index names or threshold levels")]
    IndexMismatch,
    #[msg("Orders have different denomination or mint")]
    DenominationMismatch,
    #[msg("Orders have different coverage or premium amounts")]
    AmountMismatch,
}
