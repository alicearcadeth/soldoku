import { loadOperatorEnv } from "./operator-env.mjs";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseEnv } from "node:util";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";

const env = loadOperatorEnv();
const connection = new Connection(env.ARTPORTAL_SOLANA_RPC_URL.trim(), "confirmed");
const mint = new PublicKey("J7STDEHGniYdSjuY4HKZMoSdr1KckYiGNdfnmsrYiLw7");
const info = await connection.getAccountInfo(mint);
const option = info.data.readUInt32LE(0);
const authority = option === 1 ? new PublicKey(info.data.subarray(4, 36)).toBase58() : null;
const known = ["sudoku-dev.json", "sudoku-authority.json", "sudoku-player-b.json", "sudoku-v2-authority.json"].map((name) => {
  const key = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(join(homedir(), ".config", "solana", name), "utf8"))));
  return { name, pubkey: key.publicKey.toBase58(), holds: key.publicKey.toBase58() === authority };
});
console.log(JSON.stringify({ authority, known }));
