import { loadOperatorEnv, solanaConfig } from "./operator-env.mjs";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseEnv } from "node:util";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { Connection, Keypair, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import bs58 from "bs58";

const env = loadOperatorEnv();
const rpc = env.ARTPORTAL_SOLANA_RPC_URL?.trim();
if (!rpc?.startsWith("https://")) throw new Error("Devnet RPC URL is missing");
const connection = new Connection(rpc, "confirmed");
const mint = new PublicKey(readFileSync(join(homedir(), ".config", "solana", "sudoku-devnet-mint.txt"), "utf8").trim());
const authority = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(join(homedir(), ".config", "solana", "sudoku-authority.json"), "utf8"))));
const players = [
  Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(solanaConfig("sudoku-dev.json"), "utf8")))),
  Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(join(homedir(), ".config", "solana", "sudoku-player-b.json"), "utf8")))),
];

async function send(payer, instructions, signers) {
  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  const tx = new Transaction({ feePayer: payer.publicKey, recentBlockhash: blockhash }).add(...instructions);
  tx.sign(...new Set([payer, ...signers]));
  const signature = bs58.encode(tx.signature);
  await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false });
  const started = Date.now();
  while (Date.now() - started < 30_000) {
    const status = await connection.getSignatureStatuses([signature]);
    const value = status.value[0];
    if (value?.err) throw new Error(`Transaction ${signature} failed`);
    if (value?.confirmationStatus === "confirmed" || value?.confirmationStatus === "finalized") return signature;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Transaction ${signature} status is unknown`);
}

const results = [];
for (const player of players) {
  const sol = await connection.getBalance(player.publicKey);
  let solSig = null;
  if (sol < 20_000_000) {
    solSig = await send(authority, [SystemProgram.transfer({ fromPubkey: authority.publicKey, toPubkey: player.publicKey, lamports: 50_000_000 })], [authority]);
  }
  const ata = getAssociatedTokenAddressSync(mint, player.publicKey);
  let tokenSig = null;
  if (!(await connection.getAccountInfo(ata))) {
    tokenSig = await send(authority, [createAssociatedTokenAccountInstruction(authority.publicKey, ata, player.publicKey, mint)], [authority]);
  }
  const info = await connection.getTokenAccountBalance(ata);
  let mintSig = null;
  if (BigInt(info.value.amount) < 5_000_000n) {
    mintSig = await send(authority, [createMintToInstruction(mint, ata, authority.publicKey, 5_000_000n)], [authority]);
  }
  const after = await connection.getTokenAccountBalance(ata);
  results.push({ address: player.publicKey.toBase58(), sol, tokens: after.value.amount, solSig, tokenSig, mintSig });
}
console.log(JSON.stringify(results));
