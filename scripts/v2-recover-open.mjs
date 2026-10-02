import { loadOperatorEnv } from "./operator-env.mjs";
/**
 * Cancels V2 staging matches that this wallet opened and that are still funded.
 * Prints public keys and signatures only.
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseEnv } from "node:util";
import { TOKEN_PROGRAM_ID, getAccount, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction } from "@solana/web3.js";

const PROGRAM_ID = new PublicKey("937BAWXVCW58oEKkA1FijkSXXtdgGEytUyPRV2Roge22");
const env = loadOperatorEnv();
const connection = new Connection(env.ARTPORTAL_SOLANA_RPC_URL.trim(), "confirmed");
const playerA = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(join(homedir(), ".config", "solana", "sudoku-dev.json"), "utf8"))));
const playerB = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(join(homedir(), ".config", "solana", "sudoku-player-b.json"), "utf8"))));
const mint = new PublicKey(readFileSync(join(homedir(), ".config", "solana", "sudoku-v2-mint.txt"), "utf8").trim());
const tokenA = getAssociatedTokenAddressSync(mint, playerA.publicKey);
const tokenB = getAssociatedTokenAddressSync(mint, playerB.publicKey);

async function confirm(signature) {
  const started = Date.now();
  while (Date.now() - started < 90_000) {
    const status = (await connection.getSignatureStatuses([signature])).value[0];
    if (status?.err) throw new Error(`Cancel failed: ${JSON.stringify(status.err)}`);
    if (status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized") return;
    await new Promise((resolve) => setTimeout(resolve, 800));
  }
  throw new Error("Cancel confirmation timed out");
}

const signatures = await connection.getSignaturesForAddress(playerA.publicKey, { limit: 40 });
const seen = new Set();
const recovered = [];
for (const item of signatures) {
  const tx = await connection.getTransaction(item.signature, { maxSupportedTransactionVersion: 0, commitment: "confirmed" });
  const keys = tx?.transaction.message.getAccountKeys?.()?.staticAccountKeys ?? tx?.transaction.message.accountKeys ?? [];
  for (const key of keys) {
    const pubkey = key instanceof PublicKey ? key : new PublicKey(key);
    if (seen.has(pubkey.toBase58())) continue;
    const info = await connection.getAccountInfo(pubkey);
    if (!info || !info.owner.equals(PROGRAM_ID) || info.data.length < 163 || info.data[160] === 2 || info.data[160] === 3) continue;
    seen.add(pubkey.toBase58());
    const vault = getAssociatedTokenAddressSync(mint, pubkey, true);
    const { blockhash } = await connection.getLatestBlockhash("confirmed");
    const ix = new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [
        { pubkey, isSigner: false, isWritable: true },
        { pubkey: mint, isSigner: false, isWritable: false },
        { pubkey: vault, isSigner: false, isWritable: true },
        { pubkey: tokenA, isSigner: false, isWritable: true },
        { pubkey: tokenB, isSigner: false, isWritable: true },
        { pubkey: playerA.publicKey, isSigner: true, isWritable: false },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      data: Buffer.from([3]),
    });
    const cancel = new Transaction({ feePayer: playerA.publicKey, recentBlockhash: blockhash }).add(ix);
    cancel.sign(playerA);
    const signature = await connection.sendRawTransaction(cancel.serialize());
    await confirm(signature);
    recovered.push({
      match: pubkey.toBase58(),
      signature,
      vault: (await getAccount(connection, vault)).amount.toString(),
      status: (await connection.getAccountInfo(pubkey)).data[160],
    });
  }
}
console.log(JSON.stringify({ mint: mint.toBase58(), recovered }));
