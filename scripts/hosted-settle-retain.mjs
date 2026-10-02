import { loadOperatorEnv, solanaConfig } from "./operator-env.mjs";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseEnv } from "node:util";
import { getAccount, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { Connection, Keypair, PublicKey, Transaction } from "@solana/web3.js";

const base = "https://sudoku.jamesbitarcade.workers.dev/";
const programId = new PublicKey("HUkhJi8p1XXuErpEXkgpfQjwdapigXLECRoQSu3indyS");
const playerA = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(solanaConfig("sudoku-dev.json"), "utf8"))));
const playerB = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(join(homedir(), ".config", "solana", "sudoku-player-b.json"), "utf8"))));
const env = loadOperatorEnv();
const connection = new Connection(env.ARTPORTAL_SOLANA_RPC_URL.trim(), "confirmed");
const mint = new PublicKey(readFileSync(join(homedir(), ".config", "solana", "sudoku-devnet-mint.txt"), "utf8").trim());

async function post(path, body) {
  const response = await fetch(base + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`);
  return data;
}
async function get(path) {
  const response = await fetch(base + path);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`);
  return data;
}
async function gate() {
  const issued = await post("api/captcha", {});
  await post("api/captcha/check", { id: issued.id, value: issued.target });
  return issued.id;
}
async function balance(owner) {
  return (await getAccount(connection, getAssociatedTokenAddressSync(mint, owner))).amount.toString();
}
async function escrow(matchId) {
  const idBuf = Buffer.alloc(8);
  idBuf.writeBigUInt64LE(BigInt(matchId));
  const [pda] = PublicKey.findProgramAddressSync([Buffer.from("match"), idBuf], programId);
  const info = await connection.getAccountInfo(pda);
  const vault = getAssociatedTokenAddressSync(mint, pda, true);
  const vaultAccount = await getAccount(connection, vault).catch(() => null);
  const signatures = await connection.getSignaturesForAddress(pda, { limit: 12 });
  return {
    status: info ? info.data[160] : null,
    outcome: info ? info.data[161] : null,
    vault: vaultAccount ? vaultAccount.amount.toString() : null,
    signatures: signatures.map((item) => item.signature),
  };
}
async function land(signature) {
  const started = Date.now();
  while (Date.now() - started < 40_000) {
    const value = (await connection.getSignatureStatuses([signature])).value[0];
    if (value?.err) throw new Error("transaction failed on-chain");
    if (value?.confirmationStatus === "confirmed" || value?.confirmationStatus === "finalized") return value.confirmationStatus;
    await sleep(400);
  }
  return "unknown";
}
async function deposit(code, playerId, signer) {
  const prepared = await post("api/rooms/prepare", { code, playerId });
  const tx = Transaction.from(Buffer.from(prepared.tx, "base64"));
  tx.partialSign(signer);
  const signature = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false });
  await land(signature);
  const raw = Buffer.from(tx.serialize()).toString("base64");
  await post("api/rooms/deposit", { code, playerId, tx: raw });
  return signature;
}
function solve(grid) {
  const board = grid.slice();
  const fits = (index, digit) => {
    const row = Math.floor(index / 9);
    const column = index % 9;
    for (let cursor = 0; cursor < 9; cursor++) {
      if (board[row * 9 + cursor] === digit || board[cursor * 9 + column] === digit) return false;
    }
    const boxRow = Math.floor(row / 3) * 3;
    const boxColumn = Math.floor(column / 3) * 3;
    for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) if (board[(boxRow + y) * 9 + boxColumn + x] === digit) return false;
    return true;
  };
  const fill = (index) => {
    if (index === 81) return true;
    if (board[index]) return fill(index + 1);
    for (let digit = 1; digit <= 9; digit++) {
      if (!fits(index, digit)) continue;
      board[index] = digit;
      if (fill(index + 1)) return true;
      board[index] = 0;
    }
    return false;
  };
  if (!fill(0)) throw new Error("The public puzzle has no solution");
  return board;
}
async function play(code, playerId, givens) {
  const solution = solve(givens);
  const board = givens.slice();
  const empties = [];
  for (let index = 0; index < 81; index++) if (!board[index]) empties.push(index);
  const started = Date.now();
  let view = null;
  for (let cursor = 0; cursor < empties.length; cursor++) {
    if (cursor === empties.length - 1) {
      const wait = 16_000 - (Date.now() - started);
      if (wait > 0) await sleep(wait);
    }
    board[empties[cursor]] = solution[empties[cursor]];
    let placed = false;
    for (let attempt = 0; attempt < 6 && !placed; attempt++) {
      try {
        view = await post("api/rooms/move", { code, playerId, values: board });
        placed = true;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (/slow down|finish was rejected/i.test(message)) {
          await sleep(500);
          continue;
        }
        throw error;
      }
    }
    if (!placed) throw new Error("A move was not accepted");
    if (cursor < empties.length - 1) await sleep(450);
  }
  return view;
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const beforeA = await balance(playerA.publicKey);
const beforeB = await balance(playerB.publicKey);
const host = await post("api/rooms", { level: "easy", captchaId: await gate(), wallet: playerA.publicKey.toBase58() });
const guest = await post("api/rooms/join", { code: host.code, captchaId: await gate(), wallet: playerB.publicKey.toBase58() });
const depositA = await deposit(host.code, host.playerId, playerA);
const depositB = await deposit(host.code, guest.playerId, playerB);
const beforePlay = await escrow(host.matchId);
const pending = await play(host.code, host.playerId, host.givens);
const beforeSettle = await escrow(host.matchId);
const first = fetch(`${base}api/rooms/state?code=${host.code}&playerId=${host.playerId}`).then((response) => response.json());
const second = fetch(`${base}api/rooms/state?code=${host.code}&playerId=${host.playerId}`).then((response) => response.json());
const [stateA, stateB] = await Promise.all([first, second]);
const seen = [];
let retained = null;
for (let attempt = 0; attempt < 40; attempt++) {
  const funds = await get(`api/rooms/funds?code=${host.code}`);
  const chain = await escrow(host.matchId);
  const fresh = chain.signatures.filter((item) => !beforeSettle.signatures.includes(item));
  if (funds.settleSignature) {
    const value = (await connection.getSignatureStatuses([funds.settleSignature])).value[0];
    retained ??= {
      settleSignature: funds.settleSignature,
      fundsChain: funds.chain,
      escrowStatus: chain.status,
      confirmation: value?.confirmationStatus ?? "unknown",
    };
  }
  seen.push({ chain: funds.chain, status: chain.status, signature: funds.settleSignature, fresh: fresh.length });
  if (funds.chain === "settled" && retained) break;
  await sleep(400);
}
const again = await get(`api/rooms/state?code=${host.code}&playerId=${host.playerId}`);
const finalChain = await escrow(host.matchId);
const finalFunds = await get(`api/rooms/funds?code=${host.code}`);
console.log(JSON.stringify({
  kind: "live-devnet-settlement-retention",
  code: host.code,
  matchId: host.matchId,
  playerA: playerA.publicKey.toBase58(),
  playerB: playerB.publicKey.toBase58(),
  beforeA,
  beforeB,
  afterA: await balance(playerA.publicKey),
  afterB: await balance(playerB.publicKey),
  depositA,
  depositB,
  vaultBefore: beforePlay.vault,
  pendingChain: pending?.chain ?? null,
  pendingVerdict: pending?.verdict?.outcome ?? null,
  signaturesBeforeSettle: beforeSettle.signatures.length,
  firstStateChain: stateA.chain ?? null,
  secondStateChain: stateB.chain ?? null,
  retained,
  samples: seen.filter((item, index) => index === 0 || item.signature !== seen[index - 1].signature || item.status !== seen[index - 1].status || item.chain !== seen[index - 1].chain),
  againChain: again.chain,
  finalStatus: finalChain.status,
  finalOutcome: finalChain.outcome,
  finalVault: finalChain.vault,
  finalSignatures: finalChain.signatures,
  finalSettleSignature: finalFunds.settleSignature,
  sameSignature: Boolean(retained && finalFunds.settleSignature === retained.settleSignature),
}, null, 2));
