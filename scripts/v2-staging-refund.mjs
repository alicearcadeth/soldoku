import { loadOperatorEnv } from "./operator-env.mjs";
/**
 * Refunds the staging room created by scripts/v2-staging-flow.mjs
 * after its join deadline. Prints the public result only.
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseEnv } from "node:util";
import { TOKEN_PROGRAM_ID, getAccount, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { Connection, Keypair, PublicKey, SYSVAR_CLOCK_PUBKEY, Transaction, TransactionInstruction } from "@solana/web3.js";

const room = JSON.parse(readFileSync("snapshots/v2-staging-room.json", "utf8"));
const env = loadOperatorEnv();
const connection = new Connection(env.ARTPORTAL_SOLANA_RPC_URL.trim(), "confirmed");
const player = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(join(homedir(), ".config", "solana", "sudoku-dev.json"), "utf8"))));
const programId = new PublicKey(room.owner);
const mint = new PublicKey(readFileSync(join(homedir(), ".config", "solana", "sudoku-v2-mint.txt"), "utf8").trim());
const idBuf = Buffer.alloc(8);
idBuf.writeBigUInt64LE(BigInt(room.matchId));
const [pda] = PublicKey.findProgramAddressSync([Buffer.from("match"), idBuf], programId);
const tokenA = getAssociatedTokenAddressSync(mint, player.publicKey);
const tokenB = getAssociatedTokenAddressSync(mint, Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(join(homedir(), ".config", "solana", "sudoku-player-b.json"), "utf8")))).publicKey);
const deadline = BigInt(room.joinDeadline);
while (true) {
  const clock = await connection.getAccountInfo(SYSVAR_CLOCK_PUBKEY);
  if (clock.data.readBigInt64LE(32) >= deadline + 2n) break;
  await new Promise((resolve) => setTimeout(resolve, 5000));
}
const vault = getAssociatedTokenAddressSync(mint, pda, true);
const { blockhash } = await connection.getLatestBlockhash("confirmed");
const tx = new Transaction({ feePayer: player.publicKey, recentBlockhash: blockhash }).add(new TransactionInstruction({
  programId,
  keys: [
    { pubkey: pda, isSigner: false, isWritable: true },
    { pubkey: mint, isSigner: false, isWritable: false },
    { pubkey: vault, isSigner: false, isWritable: true },
    { pubkey: tokenA, isSigner: false, isWritable: true },
    { pubkey: tokenB, isSigner: false, isWritable: true },
    { pubkey: player.publicKey, isSigner: true, isWritable: false },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
  ],
  data: Buffer.from([3]),
}));
tx.sign(player);
const signature = await connection.sendRawTransaction(tx.serialize());
const started = Date.now();
while (Date.now() - started < 90_000) {
  const status = (await connection.getSignatureStatuses([signature])).value[0];
  if (status?.err) throw new Error("Staging refund failed");
  if (status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized") break;
  await new Promise((resolve) => setTimeout(resolve, 800));
}
const again = Transaction.from(tx.serialize());
let second = "not-sent";
try {
  second = await connection.sendRawTransaction(again.serialize());
} catch (error) {
  second = /already|processed|expired/i.test(String(error)) ? "already-processed-or-expired" : "unexpected";
}
console.log(JSON.stringify({
  code: room.code,
  signature,
  second,
  vault: (await getAccount(connection, vault)).amount.toString(),
  status: (await connection.getAccountInfo(pda)).data[160],
}));
