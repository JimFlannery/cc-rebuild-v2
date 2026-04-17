use anchor_lang::prelude::*;

/// The oracle wallet that is authorized to call the `settle` instruction.
/// Only transactions signed by this keypair will be accepted by the program.
///
/// Devnet keypair: ~/.config/solana/oracle-keypair.json
/// Generated: 2026-03-20
pub const ORACLE_AUTHORITY: Pubkey = pubkey!("Dtp4xjj7S56J7FFLPm5TFqA8kd3FDfNdkgAabB4cuckx");

/// The admin wallet authorized to call `init_treasury` and `fund_treasury`.
///
/// Devnet keypair: ~/.config/solana/admin-keypair.json
/// Generated: 2026-04-16
pub const ADMIN_AUTHORITY: Pubkey = pubkey!("8opT7JQYLjdkvwBraHZz2p12bCvWYszL5wX41Hp4rA1q");
