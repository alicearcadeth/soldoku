import { loadOperatorEnv, solanaConfig } from "./operator-env.mjs";
import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseEnv } from "node:util";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  MINT_SIZE,
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

const PROGRAM_ID = new PublicKey("HUkhJi8p1XXuErpEXkgpfQjwdapigXLECRoQSu3indyS");
const DEVNET = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";
const STAKE = 1_000_000n;
const env = loadOperatorEnv();
const rpc = env.ARTPORTAL_SOLANA_RPC_URL?.trim();
if (!rpc?.startsWith("https://")) throw new Error("Devnet RPC URL is missing");
const connection = new Connection(rpc, "confirmed");
const mintPath = join(homedir(), ".config", "solana", "sudoku-devnet-mint.txt");

function loadKey(path) {
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(path, "utf8"))));
}

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

async function send(payer, instructions, signers) {
  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  const tx = new Transaction({ feePayer: payer.publicKey, recentBlockhash: blockhash }).add(...instructions);
  tx.sign(...new Set([payer, ...signers]));
  const signature = bs58.encode(tx.signature);
  await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false });
  const started = Date.now();
  while (Date.now() - started < 30_000) {
    const status = await connection.getSignatureStatuses([signature]);
    const value = status.value[0];
    if (value?.err) throw new Error(`Transaction ${signature} failed`);
    if (value?.confirmationStatus === "confirmed" || value?.confirmationStatus === "finalized") return signature;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Transaction ${signature} status is unknown`);
}

async function unixNow() {
  const info = await connection.getAccountInfo(SYSVAR_CLOCK_PUBKEY);
  return info.data.readBigInt64LE(32);
}

function matchPda(id) {
  const idBuf = u64(id);
  const [pda, bump] = PublicKey.findProgramAddressSync([Buffer.from("match"), idBuf], PROGRAM_ID);
  return { pda, bump, idBuf };
}

function openIx(args) {
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: args.pda, isSigner: false, isWritable: true },
      { pubkey: args.mint, isSigner: false, isWritable: false },
      { pubkey: args.playerToken, isSigner: false, isWritable: true },
      { pubkey: args.vault, isSigner: false, isWritable: true },
      { pubkey: args.player.publicKey, isSigner: true, isWritable: true },
      { pubkey: args.authority.publicKey, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([
      Buffer.from([0]),
      args.idBuf,
      u64(STAKE),
      i64(args.joinDeadline),
      i64(args.settleDeadline),
      Buffer.from([args.bump]),
    ]),
  });
}

function joinIx({ pda, mint, player, playerToken, vault }) {
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: pda, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: playerToken, isSigner: false, isWritable: true },
      { pubkey: vault, isSigner: false, isWritable: true },
      { pubkey: player.publicKey, isSigner: true, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.from([1]),
  });
}

function settleIx({ pda, mint, vault, tokenA, tokenB, authority, outcome }) {
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: pda, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: vault, isSigner: false, isWritable: true },
      { pubkey: tokenA, isSigner: false, isWritable: true },
      { pubkey: tokenB, isSigner: false, isWritable: true },
      { pubkey: authority.publicKey, isSigner: true, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.from([2, outcome]),
  });
}

function cancelIx({ pda, mint, vault, tokenA, tokenB, player }) {
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: pda, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: vault, isSigner: false, isWritable: true },
      { pubkey: tokenA, isSigner: false, isWritable: true },
      { pubkey: tokenB, isSigner: false, isWritable: true },
      { pubkey: player.publicKey, isSigner: true, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.from([3]),
  });
}

async function balance(token) {
  return (await getAccount(connection, token)).amount;
}

async function ensureSol(from, to, lamports) {
  const current = await connection.getBalance(to.publicKey);
  if (current >= lamports) return null;
  return send(from, [SystemProgram.transfer({ fromPubkey: from.publicKey, toPubkey: to.publicKey, lamports })], [from]);
}

const dev = loadKey(solanaConfig("sudoku-dev.json"));
const authority = loadKey(join(homedir(), ".config", "solana", "sudoku-authority.json"));
const playerA = Keypair.generate();
const playerB = Keypair.generate();
const genesis = await connection.getGenesisHash();
if (genesis !== DEVNET) throw new Error("RPC is not Devnet");

const fundAuthority = await ensureSol(dev, authority, 500_000_000);
const fundA = await ensureSol(dev, playerA, 50_000_000);
const fundB = await ensureSol(dev, playerB, 50_000_000);

let mint;
try {
  mint = new PublicKey(readFileSync(mintPath, "utf8").trim());
  if (!(await connection.getAccountInfo(mint))) throw new Error("missing");
} catch {
  const created = Keypair.generate();
  const lamports = await connection.getMinimumBalanceForRentExemption(MINT_SIZE);
  await send(authority, [
    SystemProgram.createAccount({
      fromPubkey: authority.publicKey,
      newAccountPubkey: created.publicKey,
      space: MINT_SIZE,
      lamports,
      programId: TOKEN_PROGRAM_ID,
    }),
    createInitializeMintInstruction(created.publicKey, 6, authority.publicKey, null),
  ], [authority, created]);
  mint = created.publicKey;
  writeFileSync(mintPath, mint.toBase58());
}
async function ensureToken(owner) {
  const ata = getAssociatedTokenAddressSync(mint, owner.publicKey);
  if (!(await connection.getAccountInfo(ata))) {
    await send(authority, [createAssociatedTokenAccountInstruction(authority.publicKey, ata, owner.publicKey, mint)], [authority]);
  }
  if ((await getAccount(connection, ata).then((account) => account.amount).catch(() => 0n)) < 5_000_000n) {
    await send(authority, [createMintToInstruction(mint, ata, authority.publicKey, 5_000_000n)], [authority]);
  }
  return ata;
}
const tokenA = await ensureToken(playerA);
const tokenB = await ensureToken(playerB);

const now = await unixNow();
const base = BigInt(Date.now());
const opened = matchPda(base);
const vault = getAssociatedTokenAddressSync(mint, opened.pda, true);
const openSig = await send(playerA, [openIx({ ...opened, mint, player: playerA, playerToken: tokenA, vault, authority, joinDeadline: now + 3600n, settleDeadline: now + 7200n })], [playerA]);
const joinSig = await send(playerB, [joinIx({ pda: opened.pda, mint, player: playerB, playerToken: tokenB, vault })], [playerB]);
const settleSig = await send(authority, [settleIx({ pda: opened.pda, mint, vault, tokenA, tokenB, authority, outcome: 1 })], [authority]);
if ((await balance(tokenA)) !== 6_000_000n || (await balance(tokenB)) !== 4_000_000n) throw new Error("winner settlement balances are wrong");
await send(authority, [settleIx({ pda: opened.pda, mint, vault, tokenA, tokenB, authority, outcome: 1 })], [authority]);
if ((await balance(tokenA)) !== 6_000_000n || (await balance(tokenB)) !== 4_000_000n) throw new Error("replay settle moved tokens");

const draw = matchPda(base + 1n);
const drawVault = getAssociatedTokenAddressSync(mint, draw.pda, true);
const drawNow = await unixNow();
await send(playerA, [openIx({ ...draw, mint, player: playerA, playerToken: tokenA, vault: drawVault, authority, joinDeadline: drawNow + 3600n, settleDeadline: drawNow + 7200n })], [playerA]);
await send(playerB, [joinIx({ pda: draw.pda, mint, player: playerB, playerToken: tokenB, vault: drawVault })], [playerB]);
const beforeDrawA = await balance(tokenA);
const beforeDrawB = await balance(tokenB);
const drawSig = await send(authority, [settleIx({ pda: draw.pda, mint, vault: drawVault, tokenA, tokenB, authority, outcome: 3 })], [authority]);
if ((await balance(tokenA)) !== beforeDrawA + STAKE || (await balance(tokenB)) !== beforeDrawB + STAKE) throw new Error("draw refund balances are wrong");

const waiting = matchPda(base + 2n);
const waitingVault = getAssociatedTokenAddressSync(mint, waiting.pda, true);
const beforeLone = await balance(tokenA);
const loneAt = await unixNow();
await send(playerA, [openIx({ ...waiting, mint, player: playerA, playerToken: tokenA, vault: waitingVault, authority, joinDeadline: loneAt + 2n, settleDeadline: loneAt + 4000n })], [playerA]);
await new Promise((resolve) => setTimeout(resolve, 4000));
const loneSig = await send(playerA, [cancelIx({ pda: waiting.pda, mint, vault: waitingVault, tokenA, tokenB, player: playerA })], [playerA]);
if ((await balance(tokenA)) !== beforeLone) throw new Error("lone deposit was not refunded");

const active = matchPda(base + 3n);
const activeVault = getAssociatedTokenAddressSync(mint, active.pda, true);
const activeAt = await unixNow();
await send(playerA, [openIx({ ...active, mint, player: playerA, playerToken: tokenA, vault: activeVault, authority, joinDeadline: activeAt + 4n, settleDeadline: activeAt + 6n })], [playerA]);
await send(playerB, [joinIx({ pda: active.pda, mint, player: playerB, playerToken: tokenB, vault: activeVault })], [playerB]);
const lockedA = await balance(tokenA);
const lockedB = await balance(tokenB);
await new Promise((resolve) => setTimeout(resolve, 8000));
const bothSig = await send(playerB, [cancelIx({ pda: active.pda, mint, vault: activeVault, tokenA, tokenB, player: playerB })], [playerB]);
if ((await balance(tokenA)) !== lockedA + STAKE || (await balance(tokenB)) !== lockedB + STAKE) throw new Error("deadline refund balances are wrong");

const match = await connection.getAccountInfo(active.pda);
console.log(JSON.stringify({
  mint: mint.toBase58(),
  authority: authority.publicKey.toBase58(),
  playerA: playerA.publicKey.toBase58(),
  playerB: playerB.publicKey.toBase58(),
  fundAuthority,
  fundA,
  fundB,
  openSig,
  joinSig,
  settleSig,
  drawSig,
  loneSig,
  bothSig,
  status: match?.data[160],
  outcome: match?.data[161],
  balanceA: (await balance(tokenA)).toString(),
  balanceB: (await balance(tokenB)).toString(),
}));
