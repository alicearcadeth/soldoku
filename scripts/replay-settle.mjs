import { loadOperatorEnv } from "./operator-env.mjs";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseEnv } from "node:util";
import { getAccount, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction } from "@solana/web3.js";
import bs58 from "bs58";

const pda = new PublicKey(process.argv[2] ?? "7kKY1fvQAa8Em4yphasQahNtAHk8ucdxkniueu2TdGVA");
const env = loadOperatorEnv();
const connection = new Connection(env.ARTPORTAL_SOLANA_RPC_URL.trim(), "confirmed");
const authority = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(join(homedir(), ".config", "solana", "sudoku-authority.json"), "utf8"))));
const mint = new PublicKey(readFileSync(join(homedir(), ".config", "solana", "sudoku-devnet-mint.txt"), "utf8").trim());
const programId = new PublicKey("HUkhJi8p1XXuErpEXkgpfQjwdapigXLECRoQSu3indyS");
const before = await connection.getAccountInfo(pda);
if (!before) throw new Error("match account missing");
const playerA = new PublicKey(before.data.subarray(72, 104));
const playerB = new PublicKey(before.data.subarray(104, 136));
const tokenA = getAssociatedTokenAddressSync(mint, playerA);
const tokenB = getAssociatedTokenAddressSync(mint, playerB);
const vault = getAssociatedTokenAddressSync(mint, pda, true);
const ix = new TransactionInstruction({
  programId,
  keys: [
    { pubkey: pda, isSigner: false, isWritable: true },
    { pubkey: mint, isSigner: false, isWritable: false },
    { pubkey: vault, isSigner: false, isWritable: true },
    { pubkey: tokenA, isSigner: false, isWritable: true },
    { pubkey: tokenB, isSigner: false, isWritable: true },
    { pubkey: authority.publicKey, isSigner: true, isWritable: true },
    { pubkey: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"), isSigner: false, isWritable: false },
  ],
  data: Buffer.from([2, before.data[161]]),
});
const { blockhash } = await connection.getLatestBlockhash("confirmed");
const tx = new Transaction({ feePayer: authority.publicKey, recentBlockhash: blockhash }).add(ix);
tx.sign(authority);
const signature = bs58.encode(tx.signature);
await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false });
const started = Date.now();
let state = "unknown";
while (Date.now() - started < 30_000) {
  const value = (await connection.getSignatureStatuses([signature])).value[0];
  if (value?.err) throw new Error("duplicate settlement failed");
  if (value?.confirmationStatus === "confirmed" || value?.confirmationStatus === "finalized") {
    state = value.confirmationStatus;
    break;
  }
  await new Promise((resolve) => setTimeout(resolve, 500));
}
const after = await connection.getAccountInfo(pda);
const balanceA = (await getAccount(connection, tokenA)).amount.toString();
const balanceB = (await getAccount(connection, tokenB)).amount.toString();
console.log(JSON.stringify({
  kind: "duplicate-settle",
  signature,
  state,
  statusBefore: before.data[160],
  outcomeBefore: before.data[161],
  statusAfter: after?.data[160],
  outcomeAfter: after?.data[161],
  balanceA,
  balanceB,
}));
