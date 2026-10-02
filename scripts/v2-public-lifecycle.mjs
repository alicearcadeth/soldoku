import { loadOperatorEnv } from "./operator-env.mjs";
/**
 * Public hosted V2 lifecycle. Does not print puzzles or secrets.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { parseEnv } from "node:util";
import { createMintToInstruction, getAccount, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { Connection, Keypair, PublicKey, Transaction } from "@solana/web3.js";
import nacl from "tweetnacl";
import bs58 from "bs58";

const origin = "https://sudoku.jamesbitarcade.workers.dev";
const V2 = new PublicKey("937BAWXVCW58oEKkA1FijkSXXtdgGEytUyPRV2Roge22");
const MINT = new PublicKey("J7STDEHGniYdSjuY4HKZMoSdr1KckYiGNdfnmsrYiLw7");
const APP = new PublicKey("AixXFtny6qq792Pzt8G7ytLbM1eKRXZGSAx91EqBRo7s");
const env = loadOperatorEnv();
const connection = new Connection(env.ARTPORTAL_SOLANA_RPC_URL.trim(), "confirmed");
const loadKey = (name) => Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(join(homedir(), ".config", "solana", name), "utf8"))));
const authority = loadKey("sudoku-authority.json");
const playerA = loadKey("sudoku-dev.json");
const playerB = loadKey("sudoku-player-b.json");
if (!authority.publicKey.equals(APP)) throw new Error("Public match authority file does not match the recorded key");

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
async function confirm(signature) {
  const started = Date.now();
  while (Date.now() - started < 90_000) {
    const status = (await connection.getSignatureStatuses([signature])).value[0];
    if (status?.err) throw new Error(`Transaction failed: ${JSON.stringify(status.err)}`);
    if (status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized") return;
    await new Promise((resolve) => setTimeout(resolve, 800));
  }
  throw new Error("Confirmation timed out");
}
async function send(signers, ix) {
  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  const tx = new Transaction({ feePayer: signers[0].publicKey, recentBlockhash: blockhash }).add(ix);
  tx.sign(...signers);
  const signature = await connection.sendRawTransaction(tx.serialize());
  await confirm(signature);
  return signature;
}
function d1Rooms() {
  const query = spawnSync("npx --yes wrangler d1 execute sudoku-matches --remote --json --command \"SELECT body FROM matches WHERE id = 1\"", { shell: true, encoding: "utf8", maxBuffer: 20_000_000 });
  if (query.status !== 0) throw new Error("D1 read failed");
  const parsed = JSON.parse(query.stdout.slice(query.stdout.indexOf("[")));
  const body = parsed[0]?.results?.[0]?.body;
  if (!body) throw new Error("D1 body was empty");
  return JSON.parse(body).rooms;
}
async function captcha() {
  const issued = await post("/api/captcha");
  await post("/api/captcha/check", { id: issued.id, value: issued.target });
  return issued.id;
}
async function deposit(code, playerId, player, redeploy = false) {
  const prepared = await post("/api/rooms/prepare", { code, playerId });
  const tx = Transaction.from(Buffer.from(prepared.tx, "base64"));
  if (!tx.instructions[0].programId.equals(V2)) throw new Error("Public room prepared a non-V2 transaction");
  tx.partialSign(player);
  if (!tx.verifySignatures()) throw new Error("Authority and player signatures did not verify");
  const raw = tx.serialize().toString("base64");
  if (redeploy) {
    await connection.sendRawTransaction(Buffer.from(raw, "base64"));
    const deploy = spawn("npx", ["--yes", "wrangler", "deploy"], { shell: true, stdio: "inherit" });
    const status = await new Promise((resolve) => deploy.on("exit", resolve));
    if (status !== 0) throw new Error("Public redeploy failed");
  }
  const first = await post("/api/rooms/deposit", { code, playerId, tx: raw });
  const second = await post("/api/rooms/deposit", { code, playerId, tx: raw });
  if (first.signature !== second.signature) throw new Error("Repeat deposit created a second signature");
  return { signature: first.signature, room: first };
}
async function chainOf(matchId) {
  const idBuf = Buffer.alloc(8);
  idBuf.writeBigUInt64LE(BigInt(matchId));
  const [pda] = PublicKey.findProgramAddressSync([Buffer.from("match"), idBuf], V2);
  const info = await connection.getAccountInfo(pda);
  if (!info) return { pda: pda.toBase58(), exists: false };
  const mint = new PublicKey(info.data.subarray(40, 72));
  const vault = getAssociatedTokenAddressSync(mint, pda, true);
  const vaultAccount = await getAccount(connection, vault).catch(() => null);
  return {
    pda: pda.toBase58(),
    owner: info.owner.toBase58(),
    authority: new PublicKey(info.data.subarray(8, 40)).toBase58(),
    mint: mint.toBase58(),
    status: info.data[160],
    outcome: info.data[161],
    vault: vaultAccount ? vaultAccount.amount.toString() : "0",
    joinDeadline: info.data.readBigInt64LE(144).toString(),
    settleDeadline: info.data.readBigInt64LE(152).toString(),
  };
}
async function openFunded(players, redeploy) {
  const created = await post("/api/rooms", { level: "easy", captchaId: await captcha(), wallet: playerA.publicKey.toBase58() });
  let guest = null;
  if (players === 2) guest = await post("/api/rooms/join", { code: created.code, captchaId: await captcha(), wallet: playerB.publicKey.toBase58() });
  const first = await deposit(created.code, created.playerId, playerA, redeploy);
  let second = null;
  if (guest) second = await deposit(created.code, guest.playerId, playerB);
  return {
    code: created.code,
    matchId: created.matchId,
    playerId: created.playerId,
    guestId: guest?.playerId ?? null,
    startedAt: (guest ? second.room.startedAt : first.room.startedAt) ?? null,
    limitMs: first.room.limitMs,
    chain: await chainOf(created.matchId),
    openSignature: first.signature,
    joinSignature: second?.signature ?? null,
  };
}

const tokenB = getAssociatedTokenAddressSync(MINT, playerB.publicKey);
if ((await getAccount(connection, tokenB)).amount < 6_000_000n) {
  await send([authority], createMintToInstruction(MINT, tokenB, authority.publicKey, 4_000_000n));
}
const ugwu = d1Rooms().find((room) => room.code === "UGWU");
let expired = "prepared";
try {
  await post("/api/rooms/prepare", { code: "UGWU", playerId: ugwu.players[0].id });
} catch (error) {
  expired = String(error.message);
}
if (!/expired/i.test(expired)) throw new Error(`UGWU was not retired: ${expired}`);

const host = await post("/api/rooms", { level: "easy", captchaId: await captcha(), wallet: playerA.publicKey.toBase58() });
const guest = await post("/api/rooms/join", { code: host.code, captchaId: await captcha(), wallet: playerB.publicKey.toBase58() });
const open = await deposit(host.code, host.playerId, playerA);
const joined = await deposit(host.code, guest.playerId, playerB);
const opened = await chainOf(host.matchId);
if (opened.owner !== V2.toBase58() || opened.authority !== APP.toBase58() || opened.mint !== MINT.toBase58() || opened.vault !== "2000000") {
  throw new Error("Public V2 room did not record both deposits");
}
const stored = d1Rooms().find((room) => room.code === host.code);
if (stored.programId !== V2.toBase58()) throw new Error("The new room did not persist the V2 program id");
const board = stored.givens.slice();
const empties = [];
for (let i = 0; i < 81; i++) if (!stored.givens[i]) empties.push(i);
for (let step = 0; step < empties.length; step++) {
  if (step === empties.length - 1) await new Promise((resolve) => setTimeout(resolve, 16_000));
  board[empties[step]] = stored.solution[empties[step]];
  await post("/api/rooms/move", { code: host.code, playerId: host.playerId, values: board.slice() });
  await new Promise((resolve) => setTimeout(resolve, 450));
}
let funds = null;
for (let attempt = 0; attempt < 8; attempt++) {
  await get(`/api/rooms/state?code=${host.code}&playerId=${host.playerId}`);
  funds = await get(`/api/rooms/funds?code=${host.code}`);
  if (funds.status === 2) break;
  await new Promise((resolve) => setTimeout(resolve, 2000));
}
const settled = await chainOf(host.matchId);
if (settled.status !== 2 || settled.outcome !== 1 || settled.vault !== "0") throw new Error("Winner settlement did not pay the vault out");
const at = Date.now();
const historySignature = bs58.encode(nacl.sign.detached(new TextEncoder().encode(`sudoku-history:${playerA.publicKey.toBase58()}:${host.code}:${Math.floor(at / 1000)}`), playerA.secretKey));
const savedHistory = await post("/api/history", { wallet: playerA.publicKey.toBase58(), code: host.code, signature: historySignature, at });
const repeat = await post("/api/history", { wallet: playerA.publicKey.toBase58(), code: host.code, signature: historySignature, at });
const listAt = Date.now();
const listSignature = bs58.encode(nacl.sign.detached(new TextEncoder().encode(`sudoku-history:${playerA.publicKey.toBase58()}:${Math.floor(listAt / 1000)}`), playerA.secretKey));
const listed = await post("/api/history", { wallet: playerA.publicKey.toBase58(), signature: listSignature, at: listAt });
const stranger = Keypair.generate();
let isolated = "accepted";
try {
  const badAt = Date.now();
  const bad = bs58.encode(nacl.sign.detached(new TextEncoder().encode(`sudoku-history:${stranger.publicKey.toBase58()}:${host.code}:${Math.floor(badAt / 1000)}`), stranger.secretKey));
  await post("/api/history", { wallet: stranger.publicKey.toBase58(), code: host.code, signature: bad, at: badAt });
} catch (error) {
  isolated = String(error.message);
}
const unmatched = await openFunded(1, true);
const deadline = await openFunded(2, false);
const draw = await openFunded(2, false);
const evidence = {
  origin,
  expiredLegacy: expired,
  winner: {
    code: host.code,
    matchId: host.matchId,
    open: open.signature,
    join: joined.signature,
    chain: settled,
    history: savedHistory.summary,
    historyRows: listed.recent.filter((row) => row.code === host.code).length,
    repeatKeptOneRow: repeat.recent.filter((row) => row.code === host.code).length === 1,
    stranger: isolated,
    fundsStatus: funds.status,
  },
  unmatched,
  deadline,
  draw,
};
writeFileSync("snapshots/public-v2-lifecycle.json", JSON.stringify(evidence, null, 2));
console.log(JSON.stringify({
  expiredLegacy: expired,
  winner: { code: host.code, status: settled.status, outcome: settled.outcome, vault: settled.vault, authority: settled.authority, owner: settled.owner, history: savedHistory.summary?.outcome, stranger: isolated },
  unmatched: { code: unmatched.code, vault: unmatched.chain.vault, joinDeadline: unmatched.chain.joinDeadline },
  deadline: { code: deadline.code, vault: deadline.chain.vault, settleDeadline: deadline.chain.settleDeadline },
  draw: { code: draw.code, vault: draw.chain.vault, startedAt: draw.startedAt, limitMs: draw.limitMs },
}, null, 2));
