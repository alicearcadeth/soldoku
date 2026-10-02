import { spawn } from "node:child_process";
import { requireWslHome } from "./operator-env.mjs";

const home = requireWslHome();
const script = `#!/usr/bin/env bash
set -euo pipefail
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
solana config set --url https://api.devnet.solana.com >/tmp/devnet-config.txt
solana airdrop 2 --url https://api.devnet.solana.com "$HOME/match-escrow.json" || true
solana balance --url https://api.devnet.solana.com "$HOME/match-escrow.json" || true
`;

const child = spawn("wsl", ["tee", `${home}/try-devnet.sh`], { stdio: ["pipe", "inherit", "inherit"] });
child.stdin.end(script);
child.on("exit", (code) => process.exit(code ?? 1));
