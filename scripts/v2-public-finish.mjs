import { loadOperatorEnv } from "./operator-env.mjs";
/**
 * Closes the public V2 rooms opened by scripts/v2-public-lifecycle.mjs.
 * Draw is settled by the hosted worker. Deadline and unmatched refunds are
 * player-signed cancels. Does not print puzzles or secrets.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { parseEnv } from "node:util";
import { getAccount, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { Connection, Keypair, PublicKey, SYSVAR_CLOCK_PUBKEY, Transaction } from "@solana/web3.js";
import nacl from "tweetnacl";
import bs58 from "bs58";

const origin = "https://sudoku.jamesbitarcade.workers.dev";
const V2 = "937BAWXVCW58oEKkA1FijkSXXtdgGEytUyPRV2Roge22";
const LEGACY = "HUkhJi8p1XXuErpEXkgpfQjwdapigXLECRoQSu3indyS";
const MINT = new PublicKey("J7STDEHGniYdSjuY4HKZMoSdr1KckYiGNdfnmsrYiLw7");
const APP = "AixXFtny6qq792Pzt8G7ytLbM1eKRXZGSAx91EqBRo7s";
const evidence = JSON.parse(readFileSync("snapshots/public-v2-lifecycle.json", "utf8"));
const env = loadOperatorEnv();
const connection = new Connection(env.ARTPORTAL_SOLANA_RPC_URL.trim(), "confirmed");
const loadKey = (name) => Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(join(homedir(), ".config", "solana", name), "utf8"))));
const playerA = loadKey("sudoku-dev.json");
const playerB = loadKey("sudoku-player-b.json");

async function post(path, body) {
  const response = await fetch(origin + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) });
  const data = await response.json();
  if (!response.ok || data.error) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}
async function get(path) {
  const response = await fetch(origin + path);
  const data = await response.json();
  if (!response.ok || data.error) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}
async function clock() {
  const info = await connection.getAccountInfo(SYSVAR_CLOCK_PUBKEY);
  if (!info) throw new Error("Clock was unavailable");
  return info.data.readBigInt64LE(32);
}
async function waitUntil(targetSec) {
  while (await clock() < BigInt(targetSec)) await new Promise((resolve) => setTimeout(resolve, 5000));
}
function d1Rooms() {
  const query = spawnSync("npx --yes wrangler d1 execute sudoku-matches --remote --json --command \"SELECT body FROM matches WHERE id = 1\"", { shell: true, encoding: "utf8", maxBuffer: 20_000_000 });
  if (query.status !== 0) throw new Error("D1 read failed");
  const parsed = JSON.parse(query.stdout.slice(query.stdout.indexOf("[")));
  const body = parsed[0]?.results?.[0]?.body;
  if (!body) throw new Error("D1 body was empty");
  return JSON.parse(body).rooms;
}
async function chainOf(matchId, programId) {
  const idBuf = Buffer.alloc(8);
  idBuf.writeBigUInt64LE(BigInt(matchId));
  const program = new PublicKey(programId);
  const [pda] = PublicKey.findProgramAddressSync([Buffer.from("match"), idBuf], program);
  const info = await connection.getAccountInfo(pda);
  if (!info) return { pda: pda.toBase58(), exists: false, owner: null, status: null, outcome: null, vault: null, authority: null };
  const mint = new PublicKey(info.data.subarray(40, 72));
  const vault = getAssociatedTokenAddressSync(mint, pda, true);
  const vaultAccount = await getAccount(connection, vault).catch(() => null);
  return {
    pda: pda.toBase58(),
    exists: true,
    owner: info.owner.toBase58(),
    authority: new PublicKey(info.data.subarray(8, 40)).toBase58(),
    mint: mint.toBase58(),
    status: info.data[160],
    outcome: info.data[161],
    vault: vaultAccount ? vaultAccount.amount.toString() : "0",
  };
}
async function balance(owner) {
  const token = getAssociatedTokenAddressSync(MINT, owner);
  return (await getAccount(connection, token)).amount.toString();
}
async function playerRefund(code, playerId, player) {
  const before = await balance(player.publicKey);
  const prepared = await post("/api/rooms/prepare-refund", { code, playerId });
  const tx = Transaction.from(Buffer.from(prepared.tx, "base64"));
  if (!tx.instructions[0].programId.equals(new PublicKey(V2))) throw new Error(`${code} refund was not a V2 transaction`);
  if (tx.signatures.some((item) => item.publicKey.equals(new PublicKey(APP)))) throw new Error(`${code} refund required the match authority`);
  tx.partialSign(player);
  const raw = tx.serialize().toString("base64");
  const first = await post("/api/rooms/refund", { code, playerId, tx: raw });
  const mid = await balance(player.publicKey);
  const second = await post("/api/rooms/refund", { code, playerId, tx: raw });
  const after = await balance(player.publicKey);
  if (first.signature !== second.signature) throw new Error(`${code} refund retry used a new signature`);
  if (mid !== after) throw new Error(`${code} refund retry moved tokens again`);
  return { signature: first.signature, paid: first.paid, replayPaid: second.paid, before, after, chain: first.chain };
}

const mbayId = d1Rooms().find((room) => room.code === "MBAY").players.find((player) => player.wallet === playerA.publicKey.toBase58()).id;
const mbayState = await get(`/api/rooms/state?code=MBAY&playerId=${mbayId}`);
const at = Date.now();
const historySignature = bs58.encode(nacl.sign.detached(new TextEncoder().encode(`sudoku-history:${playerA.publicKey.toBase58()}:MBAY:${Math.floor(at / 1000)}`), playerA.secretKey));
const mbayHistory = await post("/api/history", { wallet: playerA.publicKey.toBase58(), code: "MBAY", signature: historySignature, at });

console.log(JSON.stringify({ step: "winner-record", chain: mbayState.chain, historyChain: mbayHistory.summary.chain, verdict: mbayState.verdict?.outcome ?? null }));

console.log(JSON.stringify({ step: "wait-unmatched", joinDeadline: evidence.unmatched.chain.joinDeadline }));
await waitUntil(BigInt(evidence.unmatched.chain.joinDeadline) + 2n);
const unmatched = await playerRefund(evidence.unmatched.code, evidence.unmatched.playerId, playerA);
const unmatchedChain = await chainOf(evidence.unmatched.matchId, V2);
if (unmatchedChain.status !== 3 || unmatchedChain.vault !== "0") throw new Error("Unmatched refund did not empty the vault");
console.log(JSON.stringify({ step: "unmatched", code: evidence.unmatched.code, signature: unmatched.signature, status: unmatchedChain.status, vault: unmatchedChain.vault, replayPaid: unmatched.replayPaid }));

const drawReady = evidence.draw.startedAt + evidence.draw.limitMs + 2000;
while (Date.now() < drawReady) await new Promise((resolve) => setTimeout(resolve, 5000));
let drawFunds = null;
for (let attempt = 0; attempt < 12; attempt++) {
  await get(`/api/rooms/state?code=${evidence.draw.code}&playerId=${evidence.draw.playerId}`);
  drawFunds = await get(`/api/rooms/funds?code=${evidence.draw.code}`);
  if (drawFunds.status === 2) break;
  await new Promise((resolve) => setTimeout(resolve, 3000));
}
const drawChain = await chainOf(evidence.draw.matchId, V2);
if (drawChain.status !== 2 || drawChain.outcome !== 3 || drawChain.vault !== "0") throw new Error("Draw settlement did not split the vault");
const drawAt = Date.now();
const drawSig = bs58.encode(nacl.sign.detached(new TextEncoder().encode(`sudoku-history:${playerA.publicKey.toBase58()}:${evidence.draw.code}:${Math.floor(drawAt / 1000)}`), playerA.secretKey));
const drawHistory = await post("/api/history", { wallet: playerA.publicKey.toBase58(), code: evidence.draw.code, signature: drawSig, at: drawAt });
const drawRepeat = await post("/api/history", { wallet: playerA.publicKey.toBase58(), code: evidence.draw.code, signature: drawSig, at: drawAt });
console.log(JSON.stringify({ step: "draw", code: evidence.draw.code, status: drawChain.status, outcome: drawChain.outcome, vault: drawChain.vault, history: drawHistory.summary.outcome, rows: drawRepeat.recent.filter((row) => row.code === evidence.draw.code).length }));

console.log(JSON.stringify({ step: "wait-deadline", settleDeadline: evidence.deadline.chain.settleDeadline }));
await waitUntil(BigInt(evidence.deadline.chain.settleDeadline) + 2n);
const beforeB = await balance(playerB.publicKey);
const deadline = await playerRefund(evidence.deadline.code, evidence.deadline.playerId, playerA);
const afterB = await balance(playerB.publicKey);
const deadlineChain = await chainOf(evidence.deadline.matchId, V2);
if (deadlineChain.status !== 3 || deadlineChain.vault !== "0") throw new Error("Deadline refund did not empty the vault");
if (BigInt(afterB) - BigInt(beforeB) !== 1_000_000n) throw new Error("Deadline refund did not return the second stake");
const deadlineState = await get(`/api/rooms/state?code=${evidence.deadline.code}&playerId=${evidence.deadline.playerId}`);
console.log(JSON.stringify({ step: "deadline", code: evidence.deadline.code, signature: deadline.signature, status: deadlineChain.status, vault: deadlineChain.vault, authorityUsed: false, d1: deadlineState.chain, replayPaid: deadline.replayPaid }));

const rooms = d1Rooms();
const watch = ["MBAY", "ANQ6", "JWCM", "86U6", "UGWU", "XVBJ", "NNPV", "74RM"];
const inventory = rooms.filter((room) => watch.includes(room.code)).map((room) => ({
  code: room.code,
  programId: room.programId ?? LEGACY,
  chain: room.chain,
  matchId: room.matchId ?? null,
  deposited: room.players.map((player) => player.deposited),
}));
const onChain = {
  winner: await chainOf(evidence.winner.matchId, V2),
  unmatched: unmatchedChain,
  draw: drawChain,
  deadline: deadlineChain,
};
const report = {
  mbay: { apiChain: mbayState.chain, historyChain: mbayHistory.summary.chain },
  unmatched,
  draw: { chain: drawChain, history: drawHistory.summary },
  deadline: { ...deadline, playerBDelta: (BigInt(afterB) - BigInt(beforeB)).toString(), apiChain: deadlineState.chain },
  inventory,
  onChain,
};
writeFileSync("snapshots/public-v2-finish.json", JSON.stringify(report, (_, value) => typeof value === "bigint" ? value.toString() : value, 2));
console.log(JSON.stringify({ inventory, onChain }, null, 2));
