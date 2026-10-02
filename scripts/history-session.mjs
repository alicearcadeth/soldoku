import { solanaConfig } from "./operator-env.mjs";
import { readFileSync } from "node:fs";
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import nacl from "tweetnacl";

const [stakedCode, practiceCode] = process.argv.slice(2);
const player = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(solanaConfig("sudoku-dev.json"), "utf8"))));
const wallet = player.publicKey.toBase58();
const at = Date.now();
const signature = bs58.encode(nacl.sign.detached(
  new TextEncoder().encode(`sudoku-history:${wallet}:${Math.floor(at / 1000)}`),
  player.secretKey,
));
const response = await fetch("https://sudoku.jamesbitarcade.workers.dev/api/history", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ wallet, signature, at }),
});
const body = await response.json();
const recent = Array.isArray(body.recent) ? body.recent : [];
console.log(JSON.stringify({
  status: response.status,
  staked: recent.find((item) => item.code === stakedCode) ?? null,
  practice: recent.find((item) => item.code === practiceCode) ?? null,
  rows: recent.length,
}));
