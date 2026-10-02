import { loadOperatorEnv, solanaConfig } from "./operator-env.mjs";
/**
 * Simulates one open against the public Devnet program. It does not send.
 * Prints only a status word, never the RPC URL or a key.
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction } from "@solana/web3.js";

const env = loadOperatorEnv();
const rpc = (env.SOLANA_RPC || env.ARTPORTAL_SOLANA_RPC_URL || "").trim();
if (!rpc) throw new Error("Devnet RPC is not configured");
const mint = new PublicKey(readFileSync(join(homedir(), ".config", "solana", "sudoku-devnet-mint.txt"), "utf8").trim());
const authority = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(join(homedir(), ".config", "solana", "sudoku-authority.json"), "utf8"))));
const player = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(solanaConfig("sudoku-dev.json"), "utf8"))));
const programId = new PublicKey("HUkhJi8p1XXuErpEXkgpfQjwdapigXLECRoQSu3indyS");
const connection = new Connection(rpc, "confirmed");

const id = BigInt(Date.now());
const idBuf = Buffer.alloc(8);
idBuf.writeBigUInt64LE(id);
const [pda, bump] = PublicKey.findProgramAddressSync([Buffer.from("match"), idBuf], programId);
const token = getAssociatedTokenAddressSync(mint, player.publicKey);
const vault = getAssociatedTokenAddressSync(mint, pda, true);
const clock = await connection.getAccountInfo(new PublicKey("SysvarC1ock11111111111111111111111111111111"));
const now = clock.data.readBigInt64LE(32);
const stake = Buffer.alloc(8);
stake.writeBigUInt64LE(1_000_000n);
const joinBy = Buffer.alloc(8);
joinBy.writeBigInt64LE(now + 600n);
const settleBy = Buffer.alloc(8);
settleBy.writeBigInt64LE(now + 1200n);
const tx = new Transaction().add(new TransactionInstruction({
  programId,
  keys: [
    { pubkey: pda, isSigner: false, isWritable: true },
    { pubkey: mint, isSigner: false, isWritable: false },
    { pubkey: token, isSigner: false, isWritable: true },
    { pubkey: vault, isSigner: false, isWritable: true },
    { pubkey: player.publicKey, isSigner: true, isWritable: true },
    { pubkey: authority.publicKey, isSigner: true, isWritable: false },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ],
  data: Buffer.concat([Buffer.from([0]), idBuf, stake, joinBy, settleBy, Buffer.from([bump])]),
}));
tx.feePayer = player.publicKey;
tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
tx.partialSign(authority, player);
const simulated = await connection.simulateTransaction(tx);
const err = simulated.value.err ? JSON.stringify(simulated.value.err) : "ok";
const invoked = (simulated.value.logs ?? []).some((line) => line.includes("invoke"));
console.log(JSON.stringify({ simulated: err, invoked, sent: false }));
