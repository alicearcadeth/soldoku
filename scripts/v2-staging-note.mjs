/** Marks the already-refunded staging room refunded in the staging database. Does not send a transfer. */
import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Keypair, Transaction } from "@solana/web3.js";

const origin = "https://sudoku-v2-staging.jamesbitarcade.workers.dev";
const room = JSON.parse(readFileSync("snapshots/v2-staging-room.json", "utf8"));
const player = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(join(homedir(), ".config", "solana", "sudoku-dev.json"), "utf8"))));
async function post(path, body) {
  const response = await fetch(origin + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok || data.error) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}
const prepared = await post("/api/rooms/prepare-refund", { code: room.code, playerId: room.playerId });
const tx = Transaction.from(Buffer.from(prepared.tx, "base64"));
tx.partialSign(player);
const noted = await post("/api/rooms/refund", { code: room.code, playerId: room.playerId, tx: tx.serialize().toString("base64") });
room.refundSignature = "5USTEdbF5oM8mswX1uBVyYXTJXfbhN34oYV17nnUuMpXhDQVN9FkwfhszUFXVHZhUzGCmBMgDjiV4VYhztAYuBap";
room.vault = "0";
room.status = 3;
room.stagingRecord = noted.chain ?? null;
writeFileSync("snapshots/v2-staging-room.json", JSON.stringify(room, null, 2));
console.log(JSON.stringify({ code: room.code, chain: noted.chain, paid: noted.paid ?? null }));
