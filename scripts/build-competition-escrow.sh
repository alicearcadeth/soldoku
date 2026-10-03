#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../programs/competition-escrow"
builder="${SUDOKU_SBF_BUILDER:-$HOME/.local/share/soldoku-build-tools/bin/cargo-build-sbf}"
if [[ ! -x "$builder" ]]; then
  echo "Install the isolated builder: cargo install cargo-build-sbf --version 4.4.0 --locked --root \"\$HOME/.local/share/soldoku-build-tools\"" >&2
  exit 1
fi
cargo test --locked
"$builder" --tools-version v1.54 --arch v0 -- --locked
