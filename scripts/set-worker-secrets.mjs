import { loadOperatorEnv } from "./operator-env.mjs";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseEnv } from "node:util";

const env = loadOperatorEnv();
const rpc = env.ARTPORTAL_SOLANA_RPC_URL?.trim();
const authority = readFileSync(join(homedir(), ".config", "solana", "sudoku-authority.json"), "utf8").trim();
const mint = readFileSync(join(homedir(), ".config", "solana", "sudoku-devnet-mint.txt"), "utf8").trim();
if (!rpc?.startsWith("https://") || !mint || !authority.startsWith("[")) {
  throw new Error("Hosted secrets are incomplete");
}

function put(name, value) {
  return new Promise((resolve, reject) => {
    const child = spawn("npx", ["--yes", "wrangler", "secret", "put", name], {
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
      const redacted = out.split(rpc).join("[rpc]").split(authority).join("[authority]");
      process.stdout.write(redacted);
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
console.log("secrets saved");
