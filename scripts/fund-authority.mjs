import { loadOperatorEnv, solanaConfig } from "./operator-env.mjs";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseEnv } from "node:util";
import { Connection, Keypair, SystemProgram, Transaction } from "@solana/web3.js";
import bs58 from "bs58";

const env = loadOperatorEnv();
const connection = new Connection(env.ARTPORTAL_SOLANA_RPC_URL.trim(), "confirmed");
const payer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(solanaConfig("sudoku-dev.json"), "utf8"))));
const authority = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(join(homedir(), ".config", "solana", "sudoku-authority.json"), "utf8"))));
const before = await connection.getBalance(authority.publicKey);
let signature = null;
if (before < 1_000_000_000) {
  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  const tx = new Transaction({ feePayer: payer.publicKey, recentBlockhash: blockhash }).add(
    SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: authority.publicKey, lamports: 2_000_000_000 }),
  );
  tx.sign(payer);
  signature = bs58.encode(tx.signature);
  await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false });
  const started = Date.now();
  while (Date.now() - started < 30_000) {
    const status = (await connection.getSignatureStatuses([signature])).value[0];
    if (status?.err) throw new Error("Authority funding transaction failed");
    if (status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized") break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}
const after = await connection.getBalance(authority.publicKey);
console.log(JSON.stringify({ authority: authority.publicKey.toBase58(), before, after, signature }));
