/**
 * Enables V2 for new public rooms. Does not change the match authority, mint, or RPC.
 * Prints secret names only.
 */
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";

const config = readFileSync("wrangler.jsonc", "utf8");
if (!config.includes('"name": "sudoku"') || config.includes("sudoku-v2-staging")) {
  throw new Error("Refusing to set cutover secrets on a non-public config");
}

function put(name, value) {
  return new Promise((resolve, reject) => {
    const child = spawn("npx", ["--yes", "wrangler", "secret", "put", name], { shell: true, stdio: ["pipe", "pipe", "pipe"] });
    let out = "";
    child.stdout.on("data", (chunk) => { out += chunk.toString(); });
    child.stderr.on("data", (chunk) => { out += chunk.toString(); });
    child.on("exit", (code) => {
      process.stdout.write(out);
      if (code === 0) resolve();
      else reject(new Error(`${name} was not saved (${code})`));
    });
    child.stdin.write(value);
    child.stdin.end();
  });
}

await put("SUDOKU_ESCROW_PROGRAM_ID", "937BAWXVCW58oEKkA1FijkSXXtdgGEytUyPRV2Roge22");
await put("SUDOKU_ESCROW_V2", "1");
console.log("public cutover secrets saved");
