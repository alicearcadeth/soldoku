import { spawn } from "node:child_process";
import { requireWslHome } from "./operator-env.mjs";

const home = requireWslHome();
const script = `#!/usr/bin/env bash
set -euo pipefail
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
mkdir -p "$HOME/.config/solana"
cp "$SUDOKU_DEV_KEY_WSL" "$HOME/.config/solana/sudoku-dev.json"
chmod 600 "$HOME/.config/solana/sudoku-dev.json"
solana config set --keypair "$HOME/.config/solana/sudoku-dev.json" --url https://api.devnet.solana.com >/dev/null
derived=$(solana-keygen pubkey "$HOME/.config/solana/sudoku-dev.json")
echo "PUBKEY $derived"
solana balance --url https://api.devnet.solana.com
`;

const child = spawn("wsl", ["tee", `${home}/use-dev-wallet.sh`], { stdio: ["pipe", "inherit", "inherit"] });
child.stdin.end(script);
child.on("exit", (code) => process.exit(code ?? 1));
