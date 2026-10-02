import { spawn } from "node:child_process";
import { repoFile, requireWslHome, toWslPath } from "./operator-env.mjs";

const home = requireWslHome();
const deploy = toWslPath(repoFile("programs", "match-escrow", "target", "deploy"));
const script = `#!/usr/bin/env bash
set -euo pipefail
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
ls -la "${deploy}"
solana-keygen new -o "$HOME/match-escrow.json" --no-bip39-passphrase --force
solana-keygen pubkey "$HOME/match-escrow.json"
`;

const child = spawn("wsl", ["tee", `${home}/prep-escrow.sh`], { stdio: ["pipe", "inherit", "inherit"] });
child.stdin.end(script);
child.on("exit", (code) => process.exit(code ?? 1));
