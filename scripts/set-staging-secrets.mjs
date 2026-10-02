import { loadOperatorEnv } from "./operator-env.mjs";
/**
 * Saves staging Worker secrets. Refuses the public Worker config.
 * Prints names only, never secret values.
 */
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseEnv } from "node:util";

const config = "wrangler.staging.jsonc";
const configText = readFileSync(config, "utf8");
if (!configText.includes('"name": "sudoku-v2-staging"') || configText.includes("sudoku-matches")) {
  throw new Error("Staging config does not point at the isolated worker");
}
const env = loadOperatorEnv();
const rpc = env.ARTPORTAL_SOLANA_RPC_URL?.trim();
const authority = readFileSync(join(homedir(), ".config", "solana", "sudoku-v2-authority.json"), "utf8").trim();
const mint = readFileSync(join(homedir(), ".config", "solana", "sudoku-v2-mint.txt"), "utf8").trim();
const programId = "937BAWXVCW58oEKkA1FijkSXXtdgGEytUyPRV2Roge22";
if (!rpc?.startsWith("https://") || mint === "J7STDEHGniYdSjuY4HKZMoSdr1KckYiGNdfnmsrYiLw7" || !authority.startsWith("[")) {
  throw new Error("Staging secrets are incomplete");
}

function put(name, value) {
  return new Promise((resolve, reject) => {
    const child = spawn("npx", ["--yes", "wrangler", "secret", "put", name, "--config", config], {
      shell: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let out = "";
    child.stdout.on("data", (chunk) => {
      out += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      out += chunk.toString();
    });
    child.on("exit", (code) => {
      process.stdout.write(out.split(rpc).join("[rpc]").split(authority).join("[authority]").split(mint).join("[mint]"));
      if (code === 0) resolve();
      else reject(new Error(`${name} was not saved (${code})`));
    });
    child.stdin.write(value);
    child.stdin.end();
  });
}

await put("SOLANA_RPC", rpc);
await put("SOLANA_CLUSTER", "devnet");
await put("SUDOKU_MINT", mint);
await put("SUDOKU_AUTHORITY_KEY", authority);
await put("SUDOKU_ESCROW_PROGRAM_ID", programId);
await put("SUDOKU_STAGING", "1");
console.log("staging secrets saved");
