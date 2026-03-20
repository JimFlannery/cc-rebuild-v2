use anchor_lang::prelude::*;

#[error_code]
pub enum ConditionCoverError {
    #[msg("Signer is not the authorized oracle")]
    UnauthorizedOracle,
    #[msg("Contract has already been settled")]
    AlreadySettled,
    #[msg("Invalid outcome — must be 0 (cover wins) or 1 (hedge wins)")]
    InvalidOutcome,
}
