import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";

const require = createRequire(new URL("../package.json", import.meta.url));
const { Connection } = require("@solana/web3.js");

const CODE = "2B4FB023";
const SIGNATURE = "M5zP61iyfqdkyezUNzKeffQJ6vpZBYr8UJpUrEFpLnBHwATKMtELiDSFiuVXUnXEYGNfzK9FdMhRov2UfTHbrCH";
const PROGRAM = "6uuszYMoZ2bBX8oVccpYPUgdhW6CSvASziN2m8LpJxYs";
const ROOM = "HcW8o3eTyvmV9npDfreGmuRvR2UNsriEszrcA7y1HRjp";
const WINNER = "JCVsKd4TMg1fvEs7rjf5YgLYbJfNC8Dwb4x1PchFkGM7";
const out = process.env.SUDOKU_RECONCILE_OUT;

function receipt(funded) {
  const attempt = funded?.settlement ?? null;
  return {
    chainStatus: funded?.chainStatus ?? null,
    winner: funded?.winner ?? null,
    settlementSignature: funded?.settlementSignature ?? null,
    settlementClosure: funded?.settlementClosure ?? null,
    settlementAlert: funded?.settlementAlert ?? null,
    phase: attempt?.phase ?? null,
    attemptSignature: attempt?.signature ?? null,
    also: (funded?.settlementAlso ?? []).map(item => ({ signature: item.signature, phase: item.phase })),
  };
}

const response = await fetch("https://soldoku.com/api/competitions/state", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ code: CODE }),
});
const view = await response.json();
if (!response.ok) throw new Error(view.error ?? "Room state was not readable.");
const before = receipt(view.funded);
const connection = new Connection("https://api.devnet.solana.com", "finalized");
const status = await connection.getSignatureStatuses([SIGNATURE], { searchTransactionHistory: true });
const parsed = await connection.getTransaction(SIGNATURE, { commitment: "finalized", maxSupportedTransactionVersion: 0 });
const message = parsed?.transaction.message;
const keys = message?.staticAccountKeys?.map(key => key.toBase58()) ?? message?.accountKeys?.map(key => key.toBase58()) ?? [];
const instructions = message?.compiledInstructions ?? message?.instructions ?? [];
const settle = instructions.find(instruction => {
  const program = keys[instruction.programIdIndex];
  const data = Buffer.from(instruction.data);
  return program === PROGRAM && data[0] === 3;
});
const roomIndex = settle ? keys.indexOf(ROOM) : -1;
const checks = {
  http: response.status,
  finalized: status.value[0]?.confirmationStatus === "finalized" && !status.value[0]?.err,
  program: Boolean(settle),
  room: roomIndex >= 0 && (settle.accountKeyIndexes ?? settle.accounts ?? []).includes(roomIndex),
  winner: before.winner === WINNER,
  syntheticReceipt: before.settlementSignature === "chain-closed",
  attempt: before.attemptSignature === SIGNATURE && before.phase === "unknown",
};
if (!Object.values(checks).every(Boolean)) {
  console.log(JSON.stringify({ apply: false, checks, before }, null, 2));
  process.exit(1);
}
const after = { ...before, settlementSignature: SIGNATURE, phase: "confirmed", settlementAlert: "" };
const evidence = {
  apply: false,
  code: CODE,
  signature: SIGNATURE,
  checks,
  preserves: ["winner", "claim flags", "moves", "sessions", "other rooms", "balances"],
  transfers: false,
  before,
  after,
};
if (out) writeFileSync(out, JSON.stringify(evidence, null, 2));
console.log(JSON.stringify(evidence, null, 2));
