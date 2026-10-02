import { loadOperatorEnv } from "./operator-env.mjs";
/**
 * Isolated Devnet lifecycle for the V2 escrow.
 * Uses the new program, a new mint, and the two development wallets.
 * Does not touch the legacy program or the public mint.
 * Prints public keys, signatures, and balances only.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseEnv } from "node:util";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  MINT_SIZE,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  createInitializeMintInstruction,
  createMintToInstruction,
  getAccount,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import {
  Connection,
  Keypair,
  PublicKey,
  SYSVAR_CLOCK_PUBKEY,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import bs58 from "bs58";

const PROGRAM_ID = new PublicKey("937BAWXVCW58oEKkA1FijkSXXtdgGEytUyPRV2Roge22");
const LEGACY = new PublicKey("HUkhJi8p1XXuErpEXkgpfQjwdapigXLECRoQSu3indyS");
const APP = new PublicKey("4uBUqMExgkzqW2WWKyrq1uSoAQAi3YenKnSsXTrB6T3N");
const STAKE = 1_000_000n;
const env = loadOperatorEnv();
const rpc = env.ARTPORTAL_SOLANA_RPC_URL?.trim();
if (!rpc?.startsWith("https://")) throw new Error("Devnet RPC URL is missing");
const connection = new Connection(rpc, "confirmed");
const key = (name) => Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(join(homedir(), ".config", "solana", name), "utf8"))));
const playerA = key("sudoku-dev.json");
const playerB = key("sudoku-player-b.json");
const authority = key("sudoku-v2-authority.json");
if (!authority.publicKey.equals(APP)) throw new Error("V2 match authority file does not match the recorded public key");

function u64(value) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(value);
  return buf;
}
function i64(value) {
  const buf = Buffer.alloc(8);
  buf.writeBigInt64LE(value);
  return buf;
}
async function confirm(signature, expectError = false) {
  const started = Date.now();
  while (Date.now() - started < 90_000) {
    const status = (await connection.getSignatureStatuses([signature])).value[0];
    if (status?.err) {
      if (expectError) return status.err;
      throw new Error(`Transaction failed: ${JSON.stringify(status.err)}`);
    }
    if (status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized") {
      if (expectError) throw new Error("Expected the transaction to fail");
      return null;
    }
    await new Promise((resolve) => setTimeout(resolve, 800));
  }
  throw new Error("Confirmation timed out");
}
async function send(signers, ix, { skipPreflight = false, expectError = false } = {}) {
  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  const tx = new Transaction({ feePayer: signers[0].publicKey, recentBlockhash: blockhash }).add(ix);
  tx.sign(...signers);
  const signature = await connection.sendRawTransaction(tx.serialize(), { skipPreflight });
  const err = await confirm(signature, expectError);
  return { signature, err };
}
async function now() {
  const clock = await connection.getAccountInfo(SYSVAR_CLOCK_PUBKEY);
  return clock.data.readBigInt64LE(32);
}
async function amount(token) {
  return (await getAccount(connection, token)).amount;
}

const legacyInfo = await connection.getAccountInfo(LEGACY);
const legacyData = new PublicKey(legacyInfo.data.subarray(4, 36));
const legacyProgramData = await connection.getAccountInfo(legacyData);
const legacyAuthority = legacyProgramData.data[12] === 1 ? new PublicKey(legacyProgramData.data.subarray(13, 45)).toBase58() : null;

const mint = Keypair.generate();
const rent = await connection.getMinimumBalanceForRentExemption(MINT_SIZE);
await send([authority, mint], SystemProgram.createAccount({
  fromPubkey: authority.publicKey,
  newAccountPubkey: mint.publicKey,
  lamports: rent,
  space: MINT_SIZE,
  programId: TOKEN_PROGRAM_ID,
}));
await send([authority], createInitializeMintInstruction(mint.publicKey, 6, authority.publicKey, null));
writeFileSync(join(homedir(), ".config", "solana", "sudoku-v2-mint.txt"), mint.publicKey.toBase58());

const tokenA = getAssociatedTokenAddressSync(mint.publicKey, playerA.publicKey);
const tokenB = getAssociatedTokenAddressSync(mint.publicKey, playerB.publicKey);
await send([playerA], createAssociatedTokenAccountInstruction(playerA.publicKey, tokenA, playerA.publicKey, mint.publicKey));
await send([playerB], createAssociatedTokenAccountInstruction(playerB.publicKey, tokenB, playerB.publicKey, mint.publicKey));
await send([authority], createMintToInstruction(mint.publicKey, tokenA, authority.publicKey, 8_000_000n));
await send([authority], createMintToInstruction(mint.publicKey, tokenB, authority.publicKey, 8_000_000n));

let sequence = BigInt(Date.now());
const next = () => {
  sequence += 1n;
  const idBuf = u64(sequence);
  const [pda, bump] = PublicKey.findProgramAddressSync([Buffer.from("match"), idBuf], PROGRAM_ID);
  return { id: sequence.toString(), idBuf, pda, bump, vault: getAssociatedTokenAddressSync(mint.publicKey, pda, true) };
};
const openIx = (match, authorityKey, authoritySigns, token, joinBy, settleBy, vault = match.vault) => new TransactionInstruction({
  programId: PROGRAM_ID,
  keys: [
    { pubkey: match.pda, isSigner: false, isWritable: true },
    { pubkey: mint.publicKey, isSigner: false, isWritable: false },
    { pubkey: token, isSigner: false, isWritable: true },
    { pubkey: vault, isSigner: false, isWritable: true },
    { pubkey: playerA.publicKey, isSigner: true, isWritable: true },
    { pubkey: authorityKey, isSigner: authoritySigns, isWritable: false },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ],
  data: Buffer.concat([Buffer.from([0]), match.idBuf, u64(STAKE), i64(joinBy), i64(settleBy), Buffer.from([match.bump])]),
});
const joinIx = (match) => new TransactionInstruction({
  programId: PROGRAM_ID,
  keys: [
    { pubkey: match.pda, isSigner: false, isWritable: true },
    { pubkey: mint.publicKey, isSigner: false, isWritable: false },
    { pubkey: tokenB, isSigner: false, isWritable: true },
    { pubkey: match.vault, isSigner: false, isWritable: true },
    { pubkey: playerB.publicKey, isSigner: true, isWritable: false },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
  ],
  data: Buffer.from([1]),
});
const settleIx = (match, outcome) => new TransactionInstruction({
  programId: PROGRAM_ID,
  keys: [
    { pubkey: match.pda, isSigner: false, isWritable: true },
    { pubkey: mint.publicKey, isSigner: false, isWritable: false },
    { pubkey: match.vault, isSigner: false, isWritable: true },
    { pubkey: tokenA, isSigner: false, isWritable: true },
    { pubkey: tokenB, isSigner: false, isWritable: true },
    { pubkey: authority.publicKey, isSigner: true, isWritable: false },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
  ],
  data: Buffer.from([2, outcome]),
});
const cancelIx = (match, player, playerToken = tokenA) => new TransactionInstruction({
  programId: PROGRAM_ID,
  keys: [
    { pubkey: match.pda, isSigner: false, isWritable: true },
    { pubkey: mint.publicKey, isSigner: false, isWritable: false },
    { pubkey: match.vault, isSigner: false, isWritable: true },
    { pubkey: playerToken, isSigner: false, isWritable: true },
    { pubkey: tokenB, isSigner: false, isWritable: true },
    { pubkey: player.publicKey, isSigner: true, isWritable: false },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
  ],
  data: Buffer.from([3]),
});
function readMatch(data) {
  return {
    authority: new PublicKey(data.subarray(8, 40)).toBase58(),
    status: data[160],
    outcome: data[161],
    owner: PROGRAM_ID.toBase58(),
  };
}

const evidence = {
  programId: PROGRAM_ID.toBase58(),
  matchAuthority: authority.publicKey.toBase58(),
  mint: mint.publicKey.toBase58(),
  playerA: playerA.publicKey.toBase58(),
  playerB: playerB.publicKey.toBase58(),
  legacyProgramUnchanged: {
    programId: LEGACY.toBase58(),
    programData: legacyData.toBase58(),
    upgradeAuthority: legacyAuthority,
    dataLength: legacyProgramData.data.length,
  },
};

const clock = await now();
const attack = next();
const attackResult = await send([playerA], openIx(attack, Keypair.generate().publicKey, false, tokenA, clock + 600n, clock + 1200n), { skipPreflight: true, expectError: true });
evidence.unsignedSubstitution = {
  signature: attackResult.signature,
  err: attackResult.err,
  accountCreated: Boolean(await connection.getAccountInfo(attack.pda)),
};

const partial = new Transaction().add(openIx(next(), authority.publicKey, true, tokenA, clock + 600n, clock + 1200n));
partial.feePayer = playerA.publicKey;
partial.recentBlockhash = (await connection.getLatestBlockhash("confirmed")).blockhash;
partial.partialSign(authority);
const mutated = Transaction.from(partial.serialize({ requireAllSignatures: false, verifySignatures: false }));
mutated.instructions[0].data[1] ^= 0xff;
mutated.partialSign(playerA);
evidence.modifiedAfterPartialSign = { signaturesValid: mutated.verifySignatures() };

const opened = next();
const openTx = new Transaction().add(openIx(opened, authority.publicKey, true, tokenA, clock + 600n, clock + 1200n));
openTx.feePayer = playerA.publicKey;
openTx.recentBlockhash = (await connection.getLatestBlockhash("confirmed")).blockhash;
openTx.partialSign(authority);
openTx.partialSign(playerA);
const openRaw = openTx.serialize();
const openSig = bs58.encode(openTx.signature);
await connection.sendRawTransaction(openRaw);
await confirm(openSig);
let duplicate = "resent";
try {
  const again = await connection.sendRawTransaction(openRaw);
  duplicate = again === openSig ? "same-signature" : "different-signature";
} catch (error) {
  duplicate = /already|processed/i.test(String(error)) ? "already-processed" : "unexpected";
}
const openedInfo = await connection.getAccountInfo(opened.pda);
evidence.deposit = {
  signature: openSig,
  duplicate,
  vault: (await amount(opened.vault)).toString(),
  match: { ...readMatch(openedInfo.data), owner: openedInfo.owner.toBase58() },
};

const wrongToken = getAssociatedTokenAddressSync(mint.publicKey, playerB.publicKey);
let wrongTokenErr = null;
try {
  await send([playerA], openIx(next(), authority.publicKey, true, wrongToken, clock + 600n, clock + 1200n));
} catch (error) {
  wrongTokenErr = String(error.message).slice(0, 180);
}
evidence.wrongPlayerToken = wrongTokenErr;

const beforeWinA = await amount(tokenA);
const beforeWinB = await amount(tokenB);
const joined = await send([playerB], joinIx(opened));
const settled = await send([authority], settleIx(opened, 1));
const settledAgain = await send([authority], settleIx(opened, 1));
const afterWin = await connection.getAccountInfo(opened.pda);
evidence.winner = {
  join: joined.signature,
  settle: settled.signature,
  settleAgain: settledAgain.signature,
  playerADelta: ((await amount(tokenA)) - beforeWinA).toString(),
  playerBDelta: ((await amount(tokenB)) - beforeWinB).toString(),
  vault: (await amount(opened.vault)).toString(),
  match: readMatch(afterWin.data),
};

const drawn = next();
await send([playerA, authority], openIx(drawn, authority.publicKey, true, tokenA, clock + 600n, clock + 1200n));
await send([playerB], joinIx(drawn));
const drawA = await amount(tokenA);
const drawB = await amount(tokenB);
const draw = await send([authority], settleIx(drawn, 3));
const drawAgain = await send([authority], settleIx(drawn, 3));
evidence.draw = {
  settle: draw.signature,
  settleAgain: drawAgain.signature,
  playerADelta: ((await amount(tokenA)) - drawA).toString(),
  playerBDelta: ((await amount(tokenB)) - drawB).toString(),
  vault: (await amount(drawn.vault)).toString(),
  match: readMatch((await connection.getAccountInfo(drawn.pda)).data),
};

const refundClock = await now();
const waiting = next();
await send([playerA, authority], openIx(waiting, authority.publicKey, true, tokenA, refundClock + 20n, refundClock + 80n));
const waitingBefore = await amount(tokenA);
let early = "rejected";
try {
  await send([playerA], cancelIx(waiting, playerA));
  early = "accepted";
} catch {
  early = "rejected";
}
const stuck = next();
await send([playerA, authority], openIx(stuck, authority.publicKey, true, tokenA, refundClock + 40n, refundClock + 55n));
await send([playerB], joinIx(stuck));
const stuckA = await amount(tokenA);
const stuckB = await amount(tokenB);
const other = Keypair.generate();
await send([playerA], SystemProgram.transfer({ fromPubkey: playerA.publicKey, toPubkey: other.publicKey, lamports: 50_000_000 }));
const otherToken = getAssociatedTokenAddressSync(mint.publicKey, other.publicKey);
await send([playerA], createAssociatedTokenAccountInstruction(playerA.publicKey, otherToken, other.publicKey, mint.publicKey));
await send([authority], createMintToInstruction(mint.publicKey, otherToken, authority.publicKey, STAKE));
const foreign = next();
const foreignJoin = (await now()) + 15n;
await send([other], new TransactionInstruction({
  programId: PROGRAM_ID,
  keys: [
    { pubkey: foreign.pda, isSigner: false, isWritable: true },
    { pubkey: mint.publicKey, isSigner: false, isWritable: false },
    { pubkey: otherToken, isSigner: false, isWritable: true },
    { pubkey: foreign.vault, isSigner: false, isWritable: true },
    { pubkey: other.publicKey, isSigner: true, isWritable: true },
    { pubkey: other.publicKey, isSigner: true, isWritable: false },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ],
  data: Buffer.concat([Buffer.from([0]), foreign.idBuf, u64(STAKE), i64(foreignJoin), i64(foreignJoin + 30n), Buffer.from([foreign.bump])]),
}));
const foreignInfo = await connection.getAccountInfo(foreign.pda);
evidence.foreignAuthority = {
  storedAuthority: new PublicKey(foreignInfo.data.subarray(8, 40)).toBase58(),
  isAppAuthority: new PublicKey(foreignInfo.data.subarray(8, 40)).equals(authority.publicKey),
};
while ((await now()) < refundClock + 60n || (await now()) < foreignJoin + 2n) await new Promise((resolve) => setTimeout(resolve, 2000));
const waitingRefund = await send([playerA], cancelIx(waiting, playerA));
const waitingAgain = await send([playerA], cancelIx(waiting, playerA));
const afterUnmatched = await amount(tokenA);
const stuckRefund = await send([playerB], cancelIx(stuck, playerB));
const foreignRefund = await send([other], cancelIx(foreign, other, otherToken));
evidence.refunds = {
  earlyCancel: early,
  unmatched: waitingRefund.signature,
  unmatchedAgain: waitingAgain.signature,
  unmatchedReturnedToBalanceBeforeSecondDeposit: afterUnmatched === waitingBefore,
  unmatchedStatus: (await connection.getAccountInfo(waiting.pda)).data[160],
  unmatchedVault: (await amount(waiting.vault)).toString(),
  deadlineWithoutAuthority: stuckRefund.signature,
  deadlinePlayerADelta: ((await amount(tokenA)) - stuckA).toString(),
  deadlinePlayerBDelta: ((await amount(tokenB)) - stuckB).toString(),
  deadlineVault: (await amount(stuck.vault)).toString(),
  deadlineStatus: (await connection.getAccountInfo(stuck.pda)).data[160],
  foreignRefund: foreignRefund.signature,
  foreignVault: (await amount(foreign.vault)).toString(),
};
if (evidence.deposit.vault !== "1000000") throw new Error("First deposit did not escrow one stake");
if (evidence.winner.playerADelta !== "2000000" || evidence.winner.vault !== "0" || evidence.winner.match.status !== 2) throw new Error("Winner settlement did not pay two stakes");
if (evidence.draw.playerADelta !== "1000000" || evidence.draw.playerBDelta !== "1000000" || evidence.draw.vault !== "0") throw new Error("Draw did not return both stakes");
if (!evidence.refunds.unmatchedReturnedToBalanceBeforeSecondDeposit || evidence.refunds.unmatchedVault !== "0") throw new Error("Unmatched refund did not return the stake");
if (evidence.refunds.deadlinePlayerADelta !== "2000000" || evidence.refunds.deadlinePlayerBDelta !== "1000000" || evidence.refunds.deadlineVault !== "0" || evidence.refunds.deadlineStatus !== 3) throw new Error("Deadline refund did not return both stakes");
if (evidence.foreignAuthority.isAppAuthority || evidence.refunds.foreignVault !== "0") throw new Error("Foreign match was not isolated from the app authority");

mkdirSync("snapshots", { recursive: true });
writeFileSync("snapshots/v2-devnet-lifecycle.json", JSON.stringify(evidence, null, 2));
console.log(JSON.stringify(evidence, null, 2));
