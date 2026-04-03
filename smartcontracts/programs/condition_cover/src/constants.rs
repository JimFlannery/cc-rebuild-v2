use anchor_lang::prelude::*;

/// The oracle wallet that is authorized to call the `settle` instruction.
/// Only transactions signed by this keypair will be accepted by the program.
///
/// Devnet keypair: ~/.config/solana/oracle-keypair.json
/// Generated: 2026-03-20
pub const ORACLE_AUTHORITY: Pubkey = pubkey!("Dtp4xjj7S56J7FFLPm5TFqA8kd3FDfNdkgAabB4cuckx");

/// The admin wallet authorized to call `init_treasury` and `fund_treasury`.
///
/// TODO (before private devnet / cloud deployment):
///   1. Generate a dedicated admin keypair:
///        solana-keygen new -o ~/.config/solana/admin-keypair.json
///   2. Replace this pubkey with the new admin pubkey.
///   3. Keep the admin keypair offline / in a secrets manager — never commit it.
///   4. Do NOT use the oracle keypair as admin in production.
/// Currently set to the oracle pubkey for local testing only.
pub const ADMIN_AUTHORITY: Pubkey = pubkey!("Dtp4xjj7S56J7FFLPm5TFqA8kd3FDfNdkgAabB4cuckx");
