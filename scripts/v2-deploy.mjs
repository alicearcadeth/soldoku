import { loadOperatorEnv, repoFile, toWslPath, wslLaunchArgs, wslSolana } from "./operator-env.mjs";
/**
 * Deploys the built V2 escrow under a new program id.
 * Does not touch the legacy program. Prints public addresses only.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { parseEnv } from "node:util";

const envFile = loadOperatorEnv();
const rpc = envFile.ARTPORTAL_SOLANA_RPC_URL?.trim();
if (!rpc?.startsWith("https://")) throw new Error("Devnet RPC URL is missing");

const soFile = repoFile("programs", "match-escrow", "target", "deploy", "match_escrow.so");
const so = toWslPath(soFile);
const programKey = wslSolana("sudoku-v2-program.json");
const upgradeKey = wslSolana("sudoku-v2-upgrade.json");
const localHash = createHash("sha256").update(readFileSync(soFile)).digest("hex");

const solana = process.env.SOLANA_BIN || "$HOME/.local/share/solana/install/active_release/bin/solana";
const programId = "937BAWXVCW58oEKkA1FijkSXXtdgGEytUyPRV2Roge22";
const command = [
  "mkdir -p /tmp/sudoku-v2-deploy",
  `cp '${so}' /tmp/sudoku-v2-deploy/match_escrow.so`,
  `${solana} program deploy --use-rpc --url "$SOLANA_RPC" --keypair '${upgradeKey}' --upgrade-authority '${upgradeKey}' --program-id '${programKey}' /tmp/sudoku-v2-deploy/match_escrow.so`,
  `${solana} program show ${programId} --url "$SOLANA_RPC"`,
  `${solana} program dump ${programId} /tmp/sudoku-v2-deploy/deployed.so --url "$SOLANA_RPC"`,
  "sha256sum /tmp/sudoku-v2-deploy/match_escrow.so /tmp/sudoku-v2-deploy/deployed.so",
].join(" && ");

const child = spawn("wsl", wslLaunchArgs(command), {
  env: { ...process.env, SOLANA_RPC: rpc, WSLENV: "SOLANA_RPC" },
});
function redact(chunk) {
  return chunk.toString().split(rpc).join("[rpc]");
}
process.stdout.write(`localSha256 ${localHash}\n`);
child.stdout.on("data", (chunk) => process.stdout.write(redact(chunk)));
child.stderr.on("data", (chunk) => process.stderr.write(redact(chunk)));
child.on("exit", (code) => process.exit(code ?? 1));
