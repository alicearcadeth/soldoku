import { loadOperatorEnv } from "./operator-env.mjs";
/**
 * Devnet negative check: both required signers, but player A's token account
 * is replaced with player B's. Updates the lifecycle snapshot. Prints the result only.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseEnv } from "node:util";
import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { Connection, Keypair, PublicKey, SYSVAR_CLOCK_PUBKEY, SystemProgram, Transaction, TransactionInstruction } from "@solana/web3.js";

const PROGRAM_ID = new PublicKey("937BAWXVCW58oEKkA1FijkSXXtdgGEytUyPRV2Roge22");
const env = loadOperatorEnv();
const connection = new Connection(env.ARTPORTAL_SOLANA_RPC_URL.trim(), "confirmed");
const key = (name) => Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(join(homedir(), ".config", "solana", name), "utf8"))));
const playerA = key("sudoku-dev.json");
const playerB = key("sudoku-player-b.json");
const authority = key("sudoku-v2-authority.json");
const mint = new PublicKey(readFileSync(join(homedir(), ".config", "solana", "sudoku-v2-mint.txt"), "utf8").trim());
const wrong = getAssociatedTokenAddressSync(mint, playerB.publicKey);
const id = BigInt(Date.now());
const idBuf = Buffer.alloc(8);
idBuf.writeBigUInt64LE(id);
const [pda, bump] = PublicKey.findProgramAddressSync([Buffer.from("match"), idBuf], PROGRAM_ID);
const clock = await connection.getAccountInfo(SYSVAR_CLOCK_PUBKEY);
const now = clock.data.readBigInt64LE(32);
const joinBy = Buffer.alloc(8);
const settleBy = Buffer.alloc(8);
joinBy.writeBigInt64LE(now + 600n);
settleBy.writeBigInt64LE(now + 1200n);
const stake = Buffer.alloc(8);
stake.writeBigUInt64LE(1_000_000n);
const ix = new TransactionInstruction({
  programId: PROGRAM_ID,
  keys: [
    { pubkey: pda, isSigner: false, isWritable: true },
    { pubkey: mint, isSigner: false, isWritable: false },
    { pubkey: wrong, isSigner: false, isWritable: true },
    { pubkey: getAssociatedTokenAddressSync(mint, pda, true), isSigner: false, isWritable: true },
    { pubkey: playerA.publicKey, isSigner: true, isWritable: true },
    { pubkey: authority.publicKey, isSigner: true, isWritable: false },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ],
  data: Buffer.concat([Buffer.from([0]), idBuf, stake, joinBy, settleBy, Buffer.from([bump])]),
});
const { blockhash } = await connection.getLatestBlockhash("confirmed");
const tx = new Transaction({ feePayer: playerA.publicKey, recentBlockhash: blockhash }).add(ix);
tx.sign(playerA, authority);
let result = "accepted";
try {
  await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false });
} catch (error) {
  result = String(error.message).slice(0, 240);
}
const snapshotPath = "snapshots/v2-devnet-lifecycle.json";
const snapshot = JSON.parse(readFileSync(snapshotPath, "utf8"));
snapshot.wrongPlayerToken = { submitted: false, simulation: result, accountCreated: Boolean(await connection.getAccountInfo(pda)) };
writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2));
console.log(JSON.stringify(snapshot.wrongPlayerToken));
