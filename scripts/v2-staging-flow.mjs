import { loadOperatorEnv } from "./operator-env.mjs";
/**
 * Opens one staging-worker room, deposits, redeploys the worker, and confirms
 * the same signature does not move the stake twice.
 * Prints public ids only.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { parseEnv } from "node:util";
import { getAccount, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { Connection, Keypair, PublicKey, Transaction } from "@solana/web3.js";

const origin = "https://sudoku-v2-staging.jamesbitarcade.workers.dev";
const programId = new PublicKey("937BAWXVCW58oEKkA1FijkSXXtdgGEytUyPRV2Roge22");
const env = loadOperatorEnv();
const connection = new Connection(env.ARTPORTAL_SOLANA_RPC_URL.trim(), "confirmed");
const player = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(join(homedir(), ".config", "solana", "sudoku-dev.json"), "utf8"))));

async function post(path, body) {
  const response = await fetch(origin + path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok || data.error) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}
async function confirm(signature) {
  const started = Date.now();
  while (Date.now() - started < 90_000) {
    const status = (await connection.getSignatureStatuses([signature])).value[0];
    if (status?.err) throw new Error("Staging deposit failed on-chain");
    if (status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized") return status.confirmationStatus;
    await new Promise((resolve) => setTimeout(resolve, 800));
  }
  throw new Error("Staging deposit confirmation timed out");
}

const captcha = await post("/api/captcha", {});
await post("/api/captcha/check", { id: captcha.id, value: captcha.target });
const room = await post("/api/rooms", { level: "easy", captchaId: captcha.id, wallet: player.publicKey.toBase58() });
const prepared = await post("/api/rooms/prepare", { code: room.code, playerId: room.playerId });
const tx = Transaction.from(Buffer.from(prepared.tx, "base64"));
if (!tx.instructions[0].programId.equals(programId)) throw new Error("Staging prepared a transaction for the wrong program");
tx.partialSign(player);
if (!tx.verifySignatures()) throw new Error("Player signature did not complete the staged transaction");
const raw = tx.serialize().toString("base64");
const signature = await connection.sendRawTransaction(Buffer.from(raw, "base64"));
const deploy = spawn("npx", ["--yes", "wrangler", "deploy", "--config", "wrangler.staging.jsonc"], { shell: true, stdio: "inherit" });
const deployCode = await new Promise((resolve) => deploy.on("exit", resolve));
if (deployCode !== 0) throw new Error("Staging redeploy failed");
const confirmation = await confirm(signature);
const first = await post("/api/rooms/deposit", { code: room.code, playerId: room.playerId, tx: raw });
const second = await post("/api/rooms/deposit", { code: room.code, playerId: room.playerId, tx: raw });
const idBuf = Buffer.alloc(8);
idBuf.writeBigUInt64LE(BigInt(room.matchId));
const [pda] = PublicKey.findProgramAddressSync([Buffer.from("match"), idBuf], programId);
const info = await connection.getAccountInfo(pda);
const mint = new PublicKey(info.data.subarray(40, 72));
const vault = getAssociatedTokenAddressSync(mint, pda, true);
const evidence = {
  origin,
  code: room.code,
  matchId: room.matchId,
  playerId: room.playerId,
  signature,
  confirmation,
  firstSignature: first.signature,
  secondSignature: second.signature,
  vault: (await getAccount(connection, vault)).amount.toString(),
  status: info.data[160],
  owner: info.owner.toBase58(),
  authority: new PublicKey(info.data.subarray(8, 40)).toBase58(),
  joinDeadline: info.data.readBigInt64LE(144).toString(),
};
if (evidence.vault !== "1000000" || evidence.firstSignature !== evidence.secondSignature) {
  throw new Error("Staging deposit moved more than once");
}
writeFileSync("snapshots/v2-staging-room.json", JSON.stringify(evidence, null, 2));
console.log(JSON.stringify(evidence, null, 2));
