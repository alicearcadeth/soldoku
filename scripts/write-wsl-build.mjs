import { spawn } from "node:child_process";
import { repoFile, requireWslHome, toWslPath } from "./operator-env.mjs";

const home = requireWslHome();
const crate = toWslPath(repoFile("programs", "match-escrow"));
const script = `#!/usr/bin/env bash
set -euo pipefail
export PATH="$HOME/.local/share/solana/install/active_release/bin:$HOME/.cargo/bin:$PATH"
cd "${crate}"
cargo-build-sbf
`;

const child = spawn("wsl", ["tee", `${home}/build-escrow.sh`], { stdio: ["pipe", "inherit", "inherit"] });
child.stdin.end(script);
child.on("exit", (code) => process.exit(code ?? 1));
