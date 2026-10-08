import { readFileSync } from "node:fs";
import { Connection, Keypair, PublicKey, Transaction } from "@solana/web3.js";
import { createAssociatedTokenAccountIdempotentInstruction, getAccount, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { COMPETITION_DEVNET_MINT, competitionInstructions } from "../src/competition/escrow.ts";

const args = Object.fromEntries(process.argv.slice(2).map(item => {
  const [key, value] = item.replace(/^--/, "").split("=");
  return [key, value ?? "true"];
}));
const program = new PublicKey(args.program ?? "6uuszYMoZ2bBX8oVccpYPUgdhW6CSvASziN2m8LpJxYs");
const roomId = BigInt(args["room-id"] ?? "0");
const wallet = new PublicKey(args.wallet ?? Keypair.generate().publicKey);
const refund = args.refund === "true";
const createAta = args["create-ata"] === "true";
const room = competitionInstructions(program, roomId, COMPETITION_DEVNET_MINT);
const instruction = room.claim(wallet, refund);
const destination = getAssociatedTokenAddressSync(COMPETITION_DEVNET_MINT, wallet);
if (instruction.data[0] !== (refund ? 5 : 4)) throw new Error("Recovery action tag does not match the request.");
if (!instruction.programId.equals(program) || !instruction.keys[0]?.pubkey.equals(room.room) || !instruction.keys[2]?.pubkey.equals(COMPETITION_DEVNET_MINT)
  || !instruction.keys[3]?.pubkey.equals(destination) || !instruction.keys[4]?.pubkey.equals(room.vault)) {
  throw new Error("Recovery instruction does not match this program, mint, room, or entrant.");
}
const preview = { program: program.toBase58(), tag: instruction.data[0], action: refund ? "refund" : "payout", room: room.room.toBase58(), vault: room.vault.toBase58(), destination: destination.toBase58(), feePayer: wallet.toBase58() };
if (args["dry-run"] === "true") {
  const tx = new Transaction({ feePayer: wallet, recentBlockhash: Keypair.generate().publicKey.toBase58() });
  if (createAta) tx.add(createAssociatedTokenAccountIdempotentInstruction(wallet, destination, wallet, COMPETITION_DEVNET_MINT));
  tx.add(instruction);
  console.log(JSON.stringify({ ...preview, createAta, bytes: tx.serialize({ requireAllSignatures: false, verifySignatures: false }).length }));
  process.exit(0);
}
if (args.send !== "true") {
  console.error("Refusing to send. Pass --dry-run=true to preview, or --send=true with SUDOKU_RECOVERY_KEY_FILE set to the entrant key file. The key is not printed.");
  process.exit(1);
}
const keyFile = process.env.SUDOKU_RECOVERY_KEY_FILE;
if (!keyFile) {
  console.error("SUDOKU_RECOVERY_KEY_FILE is required. The path and key are not printed.");
  process.exit(1);
}
const payer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(keyFile, "utf8"))));
if (!payer.publicKey.equals(wallet)) {
  console.error("The key file does not match --wallet.");
  process.exit(1);
}
const connection = new Connection(process.env.SUDOKU_COMPETITION_DEVNET_RPC ?? "https://api.devnet.solana.com", { commitment: "finalized" });
const latest = await connection.getLatestBlockhash("finalized");
if (args["simulate-missing"] === "true") {
  const missing = new PublicKey(args["missing-wallet"] ?? Keypair.generate().publicKey);
  const probe = new Transaction({ feePayer: payer.publicKey, recentBlockhash: latest.blockhash }).add(room.claim(missing, refund));
  probe.sign(payer);
  const simulated = await connection.simulateTransaction(probe);
  console.log(JSON.stringify({ ...preview, simulatedMissingDestination: true, missingDestination: getAssociatedTokenAddressSync(COMPETITION_DEVNET_MINT, missing).toBase58(), err: simulated.value.err, sent: false }));
  process.exit(simulated.value.err ? 0 : 4);
}
let destinationExists = true;
try { await getAccount(connection, destination, "finalized"); }
catch { destinationExists = false; }
if (!destinationExists && !createAta) {
  console.log(JSON.stringify({
    ...preview, sent: false, reason: "The entrant has no TEST account.",
    preparation: "Re-run with --create-ata=true so the fee payer creates the associated token account before the claim. The destination remains the entrant's ATA.",
  }));
  process.exit(3);
}
const tx = new Transaction({ feePayer: wallet, recentBlockhash: latest.blockhash });
if (!destinationExists) tx.add(createAssociatedTokenAccountIdempotentInstruction(payer.publicKey, destination, wallet, COMPETITION_DEVNET_MINT));
tx.add(instruction);
tx.sign(payer);
const before = destinationExists ? (await getAccount(connection, destination, "finalized")).amount : 0n;
const vaultBefore = (await getAccount(connection, room.vault, "finalized")).amount;
const signature = await connection.sendRawTransaction(tx.serialize(), { preflightCommitment: "finalized", maxRetries: 3 });
const expires = Date.now() + 90000;
let status = "pending";
while (Date.now() < expires) {
  const observed = (await connection.getSignatureStatuses([signature], { searchTransactionHistory: true })).value[0];
  if (observed?.err) throw new Error(`Recovery transaction failed: ${JSON.stringify(observed.err)}`);
  if (observed?.confirmationStatus === "finalized") { status = "finalized"; break; }
  await new Promise(resolve => setTimeout(resolve, 1000));
}
if (status !== "finalized") throw new Error(`Recovery transaction was not finalized. Inspect ${signature} before retrying. A timeout is not a failure.`);
const after = (await getAccount(connection, destination, "finalized")).amount;
const vaultAfter = (await getAccount(connection, room.vault, "finalized")).amount;
console.log(JSON.stringify({ ...preview, createdAta: !destinationExists, signature, status, before: before.toString(), after: after.toString(), vaultBefore: vaultBefore.toString(), vaultAfter: vaultAfter.toString() }));
