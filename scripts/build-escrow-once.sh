#!/bin/bash
set -eu
export PATH="$HOME/.local/share/solana/install/active_release/bin:$HOME/.cargo/bin:$PATH"
cd "$(dirname "$0")/../programs/match-escrow"
cargo-build-sbf --features test-settlement
cp target/deploy/match_escrow.so target/deploy/match_escrow_test.so
cargo-build-sbf
