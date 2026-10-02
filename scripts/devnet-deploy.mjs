import { loadOperatorEnv, repoFile, toWslPath, wslLaunchArgs, wslSolana } from "./operator-env.mjs";
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { parseEnv } from "node:util";

const envFile = loadOperatorEnv();
const rpc = envFile.ARTPORTAL_SOLANA_RPC_URL?.trim();
if (!rpc?.startsWith("https://")) throw new Error("Devnet RPC URL is missing");
if (/mainnet/i.test(rpc)) throw new Error("The legacy artifact deploy cannot target Mainnet");

const src = toWslPath(repoFile("programs", "match-escrow", "target", "deploy"));
const payer = wslSolana("sudoku-dev.json");
const command = [
  "export PATH=\"$HOME/.local/share/solana/install/active_release/bin:$PATH\"",
  "mkdir -p /tmp/sudoku-deploy",
  `cp "${src}/match_escrow.so" /tmp/sudoku-deploy/match_escrow.so`,
  `cp "${src}/match_escrow-keypair.json" /tmp/sudoku-deploy/match_escrow-keypair.json`,
  "solana --version",
  `solana program deploy --use-rpc --url "$SOLANA_RPC" --keypair "${payer}" --program-id /tmp/sudoku-deploy/match_escrow-keypair.json /tmp/sudoku-deploy/match_escrow.so`,
].join(" && ");

const child = spawn("wsl", wslLaunchArgs(command), {
  env: { ...process.env, SOLANA_RPC: rpc, WSLENV: "SOLANA_RPC" },
});

function redact(chunk) {
  return chunk.toString().split(rpc).join("[rpc]");
}
child.stdout.on("data", (chunk) => process.stdout.write(redact(chunk)));
child.stderr.on("data", (chunk) => process.stderr.write(redact(chunk)));
child.on("exit", (code) => process.exit(code ?? 1));
