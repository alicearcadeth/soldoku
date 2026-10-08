import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { Connection, Keypair, PublicKey, SYSVAR_CLOCK_PUBKEY, Transaction } from "@solana/web3.js";
import { createAssociatedTokenAccountIdempotentInstruction, createCloseAccountInstruction, createTransferInstruction, getAccount, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { COMPETITION_DEVNET_MINT, competitionInstructions, readCompetitionRoom } from "../src/competition/escrow.ts";

const DEVNET_GENESIS = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";
const endpoint = process.env.SUDOKU_COMPETITION_DEVNET_RPC ?? "https://api.devnet.solana.com";
const parsed = new URL(endpoint);
if (parsed.protocol !== "https:" || !parsed.hostname.includes("devnet")) throw new Error("Refusing to run outside an HTTPS Devnet RPC.");
const connection = new Connection(endpoint, { commitment: "finalized" });
const genesis = await connection.getGenesisHash();
if (genesis !== DEVNET_GENESIS) throw new Error("RPC genesis is not Devnet. No transaction was sent.");
const program = new PublicKey("6uuszYMoZ2bBX8oVccpYPUgdhW6CSvASziN2m8LpJxYs");
const load = (file) => {
  try { return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(join(homedir(), ".config", "solana", file), "utf8")))); }
  catch { throw new Error(`Devnet signer file ${file} could not be used. The file contents were not printed.`); }
};
const winner = load("sudoku-dev.json");
const loser = load("sudoku-player-b.json");
const authority = load("sudoku-v2-authority.json");
const stake = 1_000_000n;
const evidence = { cluster: "devnet", genesis, program: program.toBase58(), mint: COMPETITION_DEVNET_MINT.toBase58(), rooms: [], passed: false };
const outDir = "docs/evidence/2026-10-08-devnet";
mkdirSync(outDir, { recursive: true });
const save = () => writeFileSync(join(outDir, "results.json"), JSON.stringify(evidence, null, 2));
const redact = (text) => String(text ?? "").replace(/\[[\d\s,]{40,}\]/g, "[<REDACTED>]");

async function balance(owner) {
  const ata = getAssociatedTokenAddressSync(COMPETITION_DEVNET_MINT, owner);
  let tokens = 0n;
  try { tokens = (await getAccount(connection, ata, "finalized")).amount; } catch { tokens = 0n; }
  return { sol: await connection.getBalance(owner, "finalized"), tokens, ata };
}
const before = { winner: await balance(winner.publicKey), loser: await balance(loser.publicKey), authority: await balance(authority.publicKey) };
evidence.balancesBefore = {
  winner: { wallet: winner.publicKey.toBase58(), sol: before.winner.sol, test: before.winner.tokens.toString() },
  loser: { wallet: loser.publicKey.toBase58(), sol: before.loser.sol, test: before.loser.tokens.toString() },
  authority: { wallet: authority.publicKey.toBase58(), sol: before.authority.sol },
};
const returningParked = process.argv.includes("--return-parked");
const resumingRoom = process.argv.some(item => item.startsWith("--resume-missing="));
if (!returningParked && !resumingRoom) save();
if (before.winner.sol < 20_000_000 || before.loser.sol < 20_000_000 || before.authority.sol < 20_000_000) throw new Error("A Devnet signer has under 0.02 SOL. No room was opened.");
if (!returningParked && !resumingRoom && (before.winner.tokens < stake * 3n || before.loser.tokens < stake)) throw new Error("A player has under the TEST needed for these rooms. No room was opened.");

const send = async (action, signers, ...instructions) => {
  const latest = await connection.getLatestBlockhash("finalized");
  const tx = new Transaction({ feePayer: signers[0].publicKey, recentBlockhash: latest.blockhash }).add(...instructions);
  tx.sign(...signers);
  const signature = await connection.sendRawTransaction(tx.serialize(), { preflightCommitment: "finalized", maxRetries: 3 });
  const expires = Date.now() + 90000;
  while (Date.now() < expires) {
    const status = (await connection.getSignatureStatuses([signature], { searchTransactionHistory: true })).value[0];
    if (status?.err) throw new Error(`${action} failed on Devnet.`);
    if (status?.confirmationStatus === "finalized") return signature;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error(`${action} was not finalized. Inspect ${signature} before retrying. A timeout is not a failure.`);
};
const now = async () => (await connection.getAccountInfo(SYSVAR_CLOCK_PUBKEY)).data.readBigInt64LE(32);
const until = async (timestamp) => { while (await now() < timestamp) await new Promise(resolve => setTimeout(resolve, 1000)); };
const roomOf = (id) => competitionInstructions(program, id, COMPETITION_DEVNET_MINT);
if (process.argv.includes("--return-parked")) {
  const parked = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync("output/devnet-parked.json", "utf8"))));
  const from = getAssociatedTokenAddressSync(COMPETITION_DEVNET_MINT, parked.publicKey);
  const to = getAssociatedTokenAddressSync(COMPETITION_DEVNET_MINT, winner.publicKey);
  const held = (await getAccount(connection, from, "finalized")).amount;
  await send("return-parked", [winner, parked], createTransferInstruction(from, to, parked.publicKey, held));
  unlinkSync("output/devnet-parked.json");
  const vault = (await getAccount(connection, roomOf(1791474514012n).vault, "finalized")).amount;
  console.log(JSON.stringify({ returned: held.toString(), vault: vault.toString(), parkedRemaining: "0" }));
  process.exit(0);
}
const resumeMissing = process.argv.find(item => item.startsWith("--resume-missing="))?.split("=")[1];
if (resumeMissing) {
  const prior = JSON.parse(readFileSync(join(outDir, "results.json"), "utf8"));
  const room = roomOf(BigInt(resumeMissing));
  const ata = getAssociatedTokenAddressSync(COMPETITION_DEVNET_MINT, winner.publicKey);
  const parked = Keypair.generate();
  const parkedFile = "output/devnet-parked.json";
  mkdirSync("output", { recursive: true });
  writeFileSync(parkedFile, JSON.stringify([...parked.secretKey]));
  const parkedAta = getAssociatedTokenAddressSync(COMPETITION_DEVNET_MINT, parked.publicKey);
  const held = (await getAccount(connection, ata, "finalized")).amount;
  await send("park-tokens", [winner],
    createAssociatedTokenAccountIdempotentInstruction(winner.publicKey, parkedAta, parked.publicKey, COMPETITION_DEVNET_MINT),
    createTransferInstruction(ata, parkedAta, winner.publicKey, held),
    createCloseAccountInstruction(ata, winner.publicKey, winner.publicKey));
  const keyFile = join(homedir(), ".config", "solana", "sudoku-dev.json");
  const recover = (extra = []) => spawnSync(process.execPath, ["--experimental-strip-types", "scripts/recover-escrow.mjs", "--send=true", `--room-id=${resumeMissing}`, `--wallet=${winner.publicKey.toBase58()}`, "--refund=true", ...extra], {
    env: { ...process.env, SUDOKU_RECOVERY_KEY_FILE: keyFile }, encoding: "utf8",
  });
  const refused = recover();
  const refusedBody = JSON.parse(redact(refused.stdout || "{}"));
  const created = recover(["--create-ata=true"]);
  const createdBody = JSON.parse(redact(created.stdout || "{}"));
  const repeated = recover(["--create-ata=true"]);
  const repeatedBody = JSON.parse(redact(repeated.stdout || "{}"));
  await send("return-parked", [winner, parked], createTransferInstruction(parkedAta, ata, parked.publicKey, held));
  try { unlinkSync(parkedFile); } catch { /* The parked key is only needed until the tokens return. */ }
  prior.missingAta = {
    room: room.room.toBase58(), vault: room.vault.toBase58(),
    refusedStatus: refused.status, refusedSent: refusedBody.sent, createdStatus: created.status, createdAta: createdBody.createdAta,
    firstDelta: (BigInt(createdBody.after) - BigInt(createdBody.before)).toString(),
    secondDelta: (BigInt(repeatedBody.after) - BigInt(repeatedBody.before)).toString(),
    vaultAfter: (await getAccount(connection, room.vault, "finalized")).amount.toString(),
  };
  prior.refund.note = "Deposits were already in the vault before this balance sample, so each +1000000 is the returned stake. The duplicate moved 0 and the vault ended at 0.";
  prior.passed = refused.status === 3 && refusedBody.sent === false && created.status === 0 && prior.missingAta.firstDelta === stake.toString() && prior.missingAta.secondDelta === "0" && prior.missingAta.vaultAfter === "0";
  writeFileSync(join(outDir, "results.json"), JSON.stringify(prior, null, 2));
  if (!prior.passed) throw new Error("Missing-account recovery did not pay exactly once.");
  console.log(JSON.stringify({ passed: true, missingAta: prior.missingAta }));
  process.exit(0);
}

const clock = await now();
const joinAt = clock + 70n;
const deadline = joinAt + 15n;
const refundAt = deadline + 60n;
const winnerId = BigInt(Date.now());
const winnerRoom = roomOf(winnerId);
const refundId = winnerId + 1n;
const refundRoom = roomOf(refundId);
const recoverId = winnerId + 2n;
const recoverRoom = roomOf(recoverId);
evidence.rooms.push(
  { kind: "winner", id: winnerId.toString(), room: winnerRoom.room.toBase58(), vault: winnerRoom.vault.toBase58() },
  { kind: "refund", id: refundId.toString(), room: refundRoom.room.toBase58(), vault: refundRoom.vault.toBase58() },
  { kind: "missing-ata", id: recoverId.toString(), room: recoverRoom.room.toBase58(), vault: recoverRoom.vault.toBase58() },
);
save();
await send("winner-open", [winner, authority], winnerRoom.open(winner.publicKey, authority.publicKey, stake, joinAt, deadline, refundAt), winnerRoom.join(winner.publicKey));
await send("winner-join", [loser], winnerRoom.join(loser.publicKey));
await send("refund-open", [winner, authority], refundRoom.open(winner.publicKey, authority.publicKey, stake, joinAt, deadline, refundAt), refundRoom.join(winner.publicKey));
await send("refund-join", [loser], refundRoom.join(loser.publicKey));
await send("recover-open", [winner, authority], recoverRoom.open(winner.publicKey, authority.publicKey, stake, joinAt, deadline, refundAt), recoverRoom.join(winner.publicKey));
await until(deadline);
const settlement = await send("winner-settle", [authority], winnerRoom.settle(authority.publicKey, winner.publicKey));
const winnerAta = getAssociatedTokenAddressSync(COMPETITION_DEVNET_MINT, winner.publicKey);
const claimBefore = (await getAccount(connection, winnerAta, "finalized")).amount;
const claimTx = new Transaction({ feePayer: winner.publicKey, recentBlockhash: (await connection.getLatestBlockhash("finalized")).blockhash }).add(winnerRoom.claim(winner.publicKey, false));
claimTx.sign(winner);
const interrupted = await connection.sendRawTransaction(claimTx.serialize(), { preflightCommitment: "finalized", maxRetries: 3 });
let interruptedStatus = "unknown";
const interruptUntil = Date.now() + 90000;
while (Date.now() < interruptUntil) {
  const status = (await connection.getSignatureStatuses([interrupted], { searchTransactionHistory: true })).value[0];
  if (status?.err) throw new Error("Interrupted winner claim failed on Devnet.");
  if (status?.confirmationStatus === "finalized") { interruptedStatus = "finalized"; break; }
  await new Promise(resolve => setTimeout(resolve, 1000));
}
if (interruptedStatus !== "finalized") throw new Error(`Interrupted claim is still ${interruptedStatus}. Inspect ${interrupted} before retrying.`);
const afterFirst = (await getAccount(connection, winnerAta, "finalized")).amount;
let duplicatePaid = false;
try {
  await send("winner-claim-duplicate", [winner], winnerRoom.claim(winner.publicKey, false));
  duplicatePaid = true;
} catch { duplicatePaid = false; }
const afterDuplicate = (await getAccount(connection, winnerAta, "finalized")).amount;
const winnerVault = (await getAccount(connection, winnerRoom.vault, "finalized")).amount;
evidence.winner = {
  settlement, interruptedSignature: interrupted, interruptedStatus, duplicateLanded: duplicatePaid,
  claimDelta: (afterFirst - claimBefore).toString(), duplicateDelta: (afterDuplicate - afterFirst).toString(), vault: winnerVault.toString(),
  status: readCompetitionRoom((await connection.getAccountInfo(winnerRoom.room)).data).status,
};
save();
if (afterFirst - claimBefore !== stake * 2n || afterDuplicate !== afterFirst || winnerVault !== 0n || evidence.winner.status !== "paid") {
  throw new Error("Winner payout did not conserve the vault.");
}

const refundBefore = await Promise.all([winner, loser].map(async player => (await getAccount(connection, getAssociatedTokenAddressSync(COMPETITION_DEVNET_MINT, player.publicKey), "finalized")).amount));
await send("refund-settle", [authority], refundRoom.settle(authority.publicKey, null));
for (const player of [winner, loser]) await send("refund-claim", [player], refundRoom.claim(player.publicKey, true));
const refundMid = await Promise.all([winner, loser].map(async player => (await getAccount(connection, getAssociatedTokenAddressSync(COMPETITION_DEVNET_MINT, player.publicKey), "finalized")).amount));
let refundDuplicate = false;
try { await send("refund-duplicate", [winner], refundRoom.claim(winner.publicKey, true)); refundDuplicate = true; } catch { refundDuplicate = false; }
const refundAfter = await Promise.all([winner, loser].map(async player => (await getAccount(connection, getAssociatedTokenAddressSync(COMPETITION_DEVNET_MINT, player.publicKey), "finalized")).amount));
const refundVault = (await getAccount(connection, refundRoom.vault, "finalized")).amount;
evidence.refund = {
  duplicateLanded: refundDuplicate, vault: refundVault.toString(),
  restored: refundMid.map((amount, index) => (amount - refundBefore[index]).toString()),
  duplicateDelta: (refundAfter[0] - refundMid[0]).toString(),
  status: readCompetitionRoom((await connection.getAccountInfo(refundRoom.room)).data).status,
};
save();
if (evidence.refund.restored.some(delta => delta !== "0") || evidence.refund.duplicateDelta !== "0" || refundVault !== 0n) throw new Error("Refund did not return each stake once.");

const ata = getAssociatedTokenAddressSync(COMPETITION_DEVNET_MINT, winner.publicKey);
const parked = Keypair.generate();
const parkedFile = "output/devnet-parked.json";
mkdirSync("output", { recursive: true });
writeFileSync(parkedFile, JSON.stringify([...parked.secretKey]));
const parkedAta = getAssociatedTokenAddressSync(COMPETITION_DEVNET_MINT, parked.publicKey);
const held = (await getAccount(connection, ata, "finalized")).amount;
await send("park-tokens", [winner],
  createAssociatedTokenAccountIdempotentInstruction(winner.publicKey, parkedAta, parked.publicKey, COMPETITION_DEVNET_MINT),
  createTransferInstruction(ata, parkedAta, winner.publicKey, held),
  createCloseAccountInstruction(ata, winner.publicKey, winner.publicKey));
const keyFile = join(homedir(), ".config", "solana", "sudoku-dev.json");
const recover = (extra = []) => spawnSync(process.execPath, ["--experimental-strip-types", "scripts/recover-escrow.mjs", "--send=true", `--room-id=${recoverId}`, `--wallet=${winner.publicKey.toBase58()}`, "--refund=true", ...extra], {
  env: { ...process.env, SUDOKU_RECOVERY_KEY_FILE: keyFile }, encoding: "utf8",
});
const refused = recover();
const refusedBody = JSON.parse(redact(refused.stdout));
const created = recover(["--create-ata=true"]);
const createdBody = JSON.parse(redact(created.stdout));
const repeated = recover(["--create-ata=true"]);
const repeatedBody = JSON.parse(redact(repeated.stdout));
await send("return-parked", [winner, parked], createTransferInstruction(parkedAta, ata, parked.publicKey, held));
try { unlinkSync(parkedFile); } catch { /* Removed after the parked tokens return. */ }
evidence.missingAta = {
  refusedStatus: refused.status, refusedSent: refusedBody.sent, createdStatus: created.status, createdAta: createdBody.createdAta,
  firstDelta: (BigInt(createdBody.after) - BigInt(createdBody.before)).toString(),
  secondDelta: (BigInt(repeatedBody.after) - BigInt(repeatedBody.before)).toString(),
  vault: (await getAccount(connection, recoverRoom.vault, "finalized")).amount.toString(),
};
save();
if (refused.status !== 3 || refusedBody.sent !== false || created.status !== 0 || evidence.missingAta.firstDelta !== stake.toString() || evidence.missingAta.secondDelta !== "0" || evidence.missingAta.vault !== "0") {
  throw new Error("Missing-account recovery did not pay exactly once.");
}
evidence.passed = true;
save();
console.log(JSON.stringify({ passed: true, rooms: evidence.rooms, winner: evidence.winner, refund: evidence.refund, missingAta: evidence.missingAta }));
