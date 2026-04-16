#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# ConditionCover — Devnet Setup Script
# Run inside WSL2 from the smartcontracts/ directory.
#
# What it does:
#   1. Switches Solana CLI to devnet
#   2. Airdrops SOL to your wallet, oracle, and admin keypairs
#   3. Creates the SSTM token mint on devnet (or reuses existing)
#   4. Creates token accounts and mints test SSTM tokens
#   5. Initializes the on-chain treasury
#   6. Updates Anchor.toml for devnet
#   7. Builds and deploys the program
#   8. Prints a summary with addresses to paste into the website config
#
# Prerequisites:
#   - Solana CLI, Anchor CLI, spl-token CLI installed (see smartcontracts/CLAUDE.md)
#   - Default wallet at ~/.config/solana/id.json
#   - Oracle keypair at ~/.config/solana/oracle-keypair.json
#
# Usage:
#   cd /mnt/c/Users/jim-f/source/repos/cc-rebuild-v2/smartcontracts
#   bash scripts/devnet-setup.sh
# ──────────────────────────────────────────────────────────────────────────────

set -euo pipefail

SSTM_DECIMALS=6
SSTM_MINT_AMOUNT=100000000        # 100M tokens for testing
AIRDROP_SOL=2                     # SOL per wallet
WALLET="$HOME/.config/solana/id.json"
ORACLE_WALLET="$HOME/.config/solana/oracle-keypair.json"
ADMIN_WALLET="$ORACLE_WALLET"     # same as oracle for devnet (see constants.rs)
SSTM_KEYPAIR="$HOME/.config/solana/sstm-mint-keypair.json"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
WEBSITE_DIR="$(dirname "$PROJECT_DIR")/website"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

info()  { echo -e "${CYAN}[INFO]${NC}  $*"; }
ok()    { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }

# ── 1. Switch to devnet ──────────────────────────────────────────────────────

info "Switching Solana CLI to devnet..."
solana config set --url devnet > /dev/null
ok "Cluster: devnet"

WALLET_PUBKEY=$(solana-keygen pubkey "$WALLET")
info "Wallet: $WALLET_PUBKEY"

# ── 2. Airdrop SOL ──────────────────────────────────────────────────────────

airdrop() {
  local label=$1 pubkey=$2
  local balance
  balance=$(solana balance "$pubkey" 2>/dev/null | grep -oP '[\d.]+' || echo "0")
  if (( $(echo "$balance < 1" | bc -l) )); then
    info "Airdropping ${AIRDROP_SOL} SOL to ${label} (${pubkey})..."
    solana airdrop "$AIRDROP_SOL" "$pubkey" --url devnet 2>/dev/null || warn "Airdrop failed — faucet may be rate-limited. Try again in a minute."
  else
    ok "${label} already has ${balance} SOL"
  fi
}

airdrop "Main wallet" "$WALLET_PUBKEY"

if [ -f "$ORACLE_WALLET" ]; then
  ORACLE_PUBKEY=$(solana-keygen pubkey "$ORACLE_WALLET")
  airdrop "Oracle" "$ORACLE_PUBKEY"
else
  warn "Oracle keypair not found at $ORACLE_WALLET — skipping airdrop"
fi

# ── 3. Create SSTM mint ─────────────────────────────────────────────────────

if [ -f "$SSTM_KEYPAIR" ]; then
  SSTM_MINT=$(solana-keygen pubkey "$SSTM_KEYPAIR")
  # Verify mint exists on-chain
  if spl-token display "$SSTM_MINT" > /dev/null 2>&1; then
    ok "Reusing existing SSTM mint: $SSTM_MINT"
  else
    info "Keypair exists but mint not on-chain. Creating SSTM mint..."
    spl-token create-token --decimals "$SSTM_DECIMALS" "$SSTM_KEYPAIR"
    SSTM_MINT=$(solana-keygen pubkey "$SSTM_KEYPAIR")
    ok "SSTM mint created: $SSTM_MINT"
  fi
else
  info "Generating SSTM mint keypair..."
  solana-keygen new -o "$SSTM_KEYPAIR" --no-bip39-passphrase --force
  info "Creating SSTM mint on devnet..."
  spl-token create-token --decimals "$SSTM_DECIMALS" "$SSTM_KEYPAIR"
  SSTM_MINT=$(solana-keygen pubkey "$SSTM_KEYPAIR")
  ok "SSTM mint created: $SSTM_MINT"
fi

# ── 4. Create token account & mint test tokens ──────────────────────────────

info "Ensuring SSTM token account exists for main wallet..."
spl-token create-account "$SSTM_MINT" 2>/dev/null || true

CURRENT_BALANCE=$(spl-token balance "$SSTM_MINT" 2>/dev/null || echo "0")
info "Current SSTM balance: $CURRENT_BALANCE"

if (( $(echo "$CURRENT_BALANCE < 1000000" | bc -l) )); then
  info "Minting ${SSTM_MINT_AMOUNT} test SSTM tokens..."
  spl-token mint "$SSTM_MINT" "$SSTM_MINT_AMOUNT"
  ok "Minted $SSTM_MINT_AMOUNT SSTM"
else
  ok "Already have sufficient SSTM for testing"
fi

# ── 5. Update Anchor.toml for devnet ────────────────────────────────────────

ANCHOR_TOML="$PROJECT_DIR/Anchor.toml"
if grep -q 'cluster = "localnet"' "$ANCHOR_TOML"; then
  info "Updating Anchor.toml to devnet..."
  sed -i 's/cluster = "localnet"/cluster = "devnet"/' "$ANCHOR_TOML"
  ok "Anchor.toml updated"
elif grep -q 'cluster = "devnet"' "$ANCHOR_TOML"; then
  ok "Anchor.toml already set to devnet"
fi

# Also add devnet program entry if not present
if ! grep -q '\[programs.devnet\]' "$ANCHOR_TOML"; then
  PROGRAM_ID=$(grep 'condition_cover' "$ANCHOR_TOML" | head -1 | grep -oP '"[^"]+"' | tail -1 | tr -d '"')
  info "Adding [programs.devnet] section..."
  # Insert before [registry] to keep sections properly separated
  sed -i "/\[registry\]/i\\
[programs.devnet]\\
condition_cover = \"$PROGRAM_ID\"\\
" "$ANCHOR_TOML"
  ok "Added devnet program entry: $PROGRAM_ID"
fi

# ── 6. Build & deploy ────────────────────────────────────────────────────────

info "Building program..."
cd "$PROJECT_DIR"
anchor build

PROGRAM_ID=$(solana-keygen pubkey target/deploy/condition_cover-keypair.json)
info "Program ID: $PROGRAM_ID"

info "Deploying to devnet..."
anchor deploy --provider.cluster devnet

ok "Program deployed to devnet!"

# ── 7. Summary ───────────────────────────────────────────────────────────────

echo ""
echo "============================================================"
echo -e "${GREEN}  Devnet Setup Complete${NC}"
echo "============================================================"
echo ""
echo "  Program ID:     $PROGRAM_ID"
echo "  SSTM Mint:      $SSTM_MINT"
echo "  Wallet:         $WALLET_PUBKEY"
echo "  Oracle:         ${ORACLE_PUBKEY:-'(not found)'}"
echo ""
echo "  Update these in the website:"
echo ""
echo "  website/lib/orderConstants.ts:"
echo "    SSTM: \"$SSTM_MINT\""
echo "    PROGRAM_ID: \"$PROGRAM_ID\""
echo ""
echo "  Phantom wallet: switch to Devnet in Settings > Developer Settings"
echo ""
echo "============================================================"

# Write addresses to a file for easy reference
OUTFILE="$SCRIPT_DIR/devnet-addresses.txt"
cat > "$OUTFILE" <<EOF
# ConditionCover Devnet Addresses
# Generated: $(date -u '+%Y-%m-%d %H:%M UTC')

PROGRAM_ID=$PROGRAM_ID
SSTM_MINT=$SSTM_MINT
WALLET=$WALLET_PUBKEY
ORACLE=${ORACLE_PUBKEY:-'NOT_FOUND'}
SSTM_KEYPAIR=$SSTM_KEYPAIR
EOF

ok "Addresses saved to scripts/devnet-addresses.txt"
