import { loadOperatorEnv, wslSolana } from "./operator-env.mjs";
/** Dumps the deployed legacy program. Does not print the RPC URL. */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseEnv } from "node:util";

const env = loadOperatorEnv();
const rpc = env.ARTPORTAL_SOLANA_RPC_URL?.trim();
if (!rpc) throw new Error("Devnet RPC is not configured");
const out = wslSolana("sudoku-legacy.so");
const dump = spawnSync("wsl", ["-e", "bash", "-lc", `solana program dump HUkhJi8p1XXuErpEXkgpfQjwdapigXLECRoQSu3indyS '${out}' --url '${rpc}'`], {
  encoding: "utf8",
});
const text = `${dump.stdout}\n${dump.stderr}`.split(rpc).join("[rpc]");
process.stdout.write(text);
if (dump.status !== 0) process.exit(dump.status ?? 1);
const bytes = readFileSync(join(homedir(), ".config", "solana", "sudoku-legacy.so"));
console.log(JSON.stringify({ bytes: bytes.length }));
