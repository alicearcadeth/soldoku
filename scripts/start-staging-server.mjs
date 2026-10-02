import { loadOperatorEnv, solanaConfig } from "./operator-env.mjs";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";

const env = loadOperatorEnv();
const rpc = (env.SOLANA_RPC || env.ARTPORTAL_SOLANA_RPC_URL || "").trim();
if (!rpc || !rpc.includes("devnet")) throw new Error("staging server requires a Devnet RPC");
const authority = readFileSync(solanaConfig("sudoku-staging-upgrade.json"), "utf8");
JSON.parse(authority);

const child = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", "5174"], {
  env: {
    ...process.env,
    SUDOKU_STAGING: "1",
    SUDOKU_ESCROW_PROGRAM_ID: "GTJ68bR2Fwkc9JcYefH9Eas9gvHnR6AkZ3TincmJsst4",
    SUDOKU_MINT: "7VaC5xJULHGQzsZsyUCaZ7BbLGNDENLjXiPbfbbRY84j",
    SOLANA_CLUSTER: "devnet",
    SOLANA_RPC: rpc,
    SUDOKU_AUTHORITY_KEY: authority,
    SUDOKU_MATCH_STORE: "data/staging-matches.json",
  },
  stdio: "inherit",
});
child.on("exit", (code) => process.exit(code ?? 1));
