import { spawn } from "node:child_process";
import { repoFile, requireWslHome, toWslPath } from "./operator-env.mjs";

const home = requireWslHome();
const key = toWslPath(repoFile("programs", "match-escrow", "target", "deploy", "match_escrow-keypair.json"));
const script = `#!/usr/bin/env bash
set -euo pipefail
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
solana-keygen pubkey "${key}"
`;

const child = spawn("wsl", ["tee", `${home}/show-id.sh`], { stdio: ["pipe", "inherit", "inherit"] });
child.stdin.end(script);
child.on("exit", (code) => process.exit(code ?? 1));
