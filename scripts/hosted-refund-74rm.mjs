import { loadOperatorEnv, solanaConfig } from "./operator-env.mjs";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseEnv } from "node:util";
import { Connection, Keypair, PublicKey, Transaction } from "@solana/web3.js";
import { getAccount, getAssociatedTokenAddressSync } from "@solana/spl-token";

const deadline = 1790394398;
const waitMs = Math.max(0, (deadline + 3) * 1000 - Date.now());
await new Promise((resolve) => setTimeout(resolve, waitMs));

const env = loadOperatorEnv();
const connection = new Connection(env.ARTPORTAL_SOLANA_RPC_URL.trim(), "confirmed");
const playerA = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(solanaConfig("sudoku-dev.json"), "utf8"))));
const mint = new PublicKey(readFileSync(join(homedir(), ".config", "solana", "sudoku-devnet-mint.txt"), "utf8").trim());
const base = "https://sudoku.jamesbitarcade.workers.dev/";

async function post(path, body) {
  const response = await fetch(base + path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? String(response.status));
  return data;
}

async function poll(signature) {
  for (let attempt = 0; attempt < 40; attempt++) {
    const status = await connection.getSignatureStatuses([signature]);
    const value = status.value[0];
    if (value?.err) throw new Error("refund failed on-chain");
    if (value && (value.confirmationStatus === "confirmed" || value.confirmationStatus === "finalized")) return value.confirmationStatus;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("refund status unknown");
}

const prepared = await post("api/rooms/prepare-refund", { code: "74RM", playerId: "77acecf68608be1b" });
const tx = Transaction.from(Buffer.from(prepared.tx, "base64"));
tx.partialSign(playerA);
const raw = Buffer.from(tx.serialize()).toString("base64");
const submitted = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false });
const polled = await poll(submitted);
const beforeApi = await (await fetch(`${base}api/rooms/funds?code=74RM`)).json();
const first = await post("api/rooms/refund", { code: "74RM", playerId: "77acecf68608be1b", tx: raw });
const second = await post("api/rooms/refund", { code: "74RM", playerId: "77acecf68608be1b", tx: raw });
const after = await (await fetch(`${base}api/rooms/funds?code=74RM`)).json();
const balanceA = (await getAccount(connection, getAssociatedTokenAddressSync(mint, playerA.publicKey))).amount.toString();
const view = await (await fetch(`${base}api/rooms/state?code=74RM&playerId=77acecf68608be1b`)).json();
console.log(JSON.stringify({
  refundSignature: submitted,
  polled,
  beforeStatus: beforeApi.status,
  firstPaid: first.paid,
  secondPaid: second.paid,
  same: first.signature === second.signature,
  afterStatus: after.status,
  chain: view.chain,
  balanceA,
}, null, 2));
