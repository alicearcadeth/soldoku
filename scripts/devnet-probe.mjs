import { loadOperatorEnv } from "./operator-env.mjs";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";

const PROGRAM = "HUkhJi8p1XXuErpEXkgpfQjwdapigXLECRoQSu3indyS";
const WALLET = "JCVsKd4TMg1fvEs7rjf5YgLYbJfNC8Dwb4x1PchFkGM7";
const DEVNET = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";

const env = loadOperatorEnv();
const rpc = env.ARTPORTAL_SOLANA_RPC_URL?.trim();
if (!rpc) throw new Error("ARTPORTAL_SOLANA_RPC_URL is missing");
const host = new URL(rpc).host;

async function call(method, params) {
  const response = await fetch(rpc, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(12_000),
  });
  const payload = await response.json();
  if (!response.ok || payload.error) {
    throw new Error(`${method} failed (${response.status})`);
  }
  return payload.result;
}

const genesis = await call("getGenesisHash", []);
const wallet = await call("getBalance", [WALLET]);
const program = await call("getAccountInfo", [PROGRAM, { encoding: "base64" }]);
const account = program?.value;
console.log(JSON.stringify({
  host,
  genesisOk: genesis === DEVNET,
  walletLamports: wallet?.value,
  program: account
    ? { executable: account.executable, owner: account.owner, lamports: account.lamports, bytes: account.data?.[0] ? Buffer.from(account.data[0], "base64").length : 0 }
    : null,
}));
