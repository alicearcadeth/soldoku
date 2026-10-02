import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createMint,
  getAccount,
  getAssociatedTokenAddressSync,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import bs58 from "bs58";
import nacl from "tweetnacl";
import { matchRecordAcceptsDeposit } from "./matchAccount";
import { assertRuntimeConfig } from "./network";
import { activeEscrowProgramId } from "./program";
import { stakeChoices } from "./stake";
import { restorePartialSignature } from "./partialSignature";
import { ensureTestMint, testSettlementMint } from "./testMint";
import { createFailoverFetch, endpoints, verifyEndpoints } from "./rpc";

const { primary: RPC, backup: RPC_BACKUP, expected: EXPECTED_CLUSTER } = endpoints();
const STAKE = 1_000_000n;

function programOf(programId?: string) {
  return new PublicKey(programId || activeEscrowProgramId());
}
const authorityPath = join(homedir(), ".config", "solana", "sudoku-authority.json");
const mintPath = join(homedir(), ".config", "solana", RPC.includes("127.0.0.1") ? "sudoku-mint.txt" : "sudoku-devnet-mint.txt");

function websocketFor(httpUrl: string): string {
  const url = new URL(httpUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  if (url.port === "8899") url.port = "8900";
  return url.toString();
}

export const connection = new Connection(RPC, {
  commitment: "confirmed",
  fetch: createFailoverFetch(RPC, RPC_BACKUP, Date.now, EXPECTED_CLUSTER),
  wsEndpoint: websocketFor(RPC_BACKUP ?? RPC),
  disableRetryOnRateLimit: true,
});

connection.confirmTransaction = (async (strategy: string | { signature: string }) => {
  const signature = typeof strategy === "string" ? strategy : strategy.signature;
  const started = Date.now();
  while (Date.now() - started < 60_000) {
    const value = (await connection.getSignatureStatuses([signature])).value[0];
    if (value?.err) throw new Error("Transaction failed on-chain");
    if (value?.confirmationStatus === "confirmed" || value?.confirmationStatus === "finalized") {
      return { context: { slot: value.slot }, value: { err: null } };
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("Transaction status is unknown. The same signature will be checked again.");
}) as Connection["confirmTransaction"];

let ready: Promise<{ authority: Keypair; mint: PublicKey }> | null = null;

function authorityKey(): Keypair {
  try {
    const raw = process.env.SUDOKU_AUTHORITY_KEY ?? readFileSync(authorityPath, "utf8");
    const secret = Uint8Array.from(JSON.parse(raw) as number[]);
    return Keypair.fromSecretKey(secret);
  } catch {
    const created = Keypair.generate();
    mkdirSync(dirname(authorityPath), { recursive: true });
    writeFileSync(authorityPath, JSON.stringify(Array.from(created.secretKey)));
    return created;
  }
}

export function chainConfig() {
  let host = "local";
  try {
    host = new URL(RPC).host;
  } catch {
    host = "local";
  }
  return {
    cluster: EXPECTED_CLUSTER,
    host,
    programId: activeEscrowProgramId(),
    stake: STAKE.toString(),
    stakeChoices: stakeChoices(),
    localnet: RPC.includes("127.0.0.1"),
    staging: process.env.SUDOKU_STAGING === "1",
    mint: process.env.SUDOKU_MINT
      ?? (RPC.includes("127.0.0.1") || process.env.SUDOKU_STAGING === "1"
        ? testSettlementMint().publicKey.toBase58()
        : "J7STDEHGniYdSjuY4HKZMoSdr1KckYiGNdfnmsrYiLw7"),
  };
}

export async function readBalances(wallet: string) {
  let key: PublicKey;
  try {
    key = new PublicKey(wallet);
  } catch {
    throw new Error("That address is not a Solana account");
  }
  const { mint } = await ensureChain();
  const sol = await connection.getBalance(key);
  const token = await getAccount(connection, getAssociatedTokenAddressSync(mint, key)).catch(() => null);
  return {
    cluster: EXPECTED_CLUSTER,
    sol,
    token: token ? token.amount.toString() : "0",
    decimals: 6,
    mint: mint.toBase58(),
  };
}

export function ensureChain() {
  ready ??= (async () => {
    await verifyEndpoints(RPC, RPC_BACKUP, EXPECTED_CLUSTER);
    const authority = authorityKey();
    const balance = await connection.getBalance(authority.publicKey);
    const local = RPC.includes("127.0.0.1");
    if (balance < 1_000_000_000) {
      if (!local) throw new Error("Match authority needs Devnet SOL. Airdrops are disabled outside localnet.");
      const sig = await connection.requestAirdrop(authority.publicKey, 2_000_000_000);
      await confirmSignature(sig);
    }
    const savedMint = (() => {
      try {
        const raw = process.env.SUDOKU_MINT ?? readFileSync(mintPath, "utf8");
        return new PublicKey(raw.trim());
      } catch {
        return null;
      }
    })();
    const mintInfo = !local && savedMint ? await connection.getAccountInfo(savedMint) : null;
    const staging = process.env.SUDOKU_STAGING === "1";
    const mint = local || staging
      ? await ensureTestMint(connection, authority)
      : mintInfo
        ? savedMint!
        : await createMint(connection, authority, authority.publicKey, null, 6);
    if (!local && !staging && !mintInfo) writeFileSync(mintPath, mint.toBase58());
    assertRuntimeConfig({
      cluster: EXPECTED_CLUSTER,
      programId: activeEscrowProgramId(),
      mint: mint.toBase58(),
      authority: authority.publicKey.toBase58(),
      rpcUrl: RPC,
      staging: process.env.SUDOKU_STAGING === "1",
    });
    return { authority, mint };
  })();
  return ready;
}

export async function fundPlayer(pubkey: string) {
  const { authority, mint } = await ensureChain();
  const player = new PublicKey(pubkey);
  const balance = await connection.getBalance(player);
  const local = RPC.includes("127.0.0.1");
  if (balance < 20_000_000) {
    if (local) {
      const sig = await connection.requestAirdrop(player, 1_000_000_000);
      await confirmSignature(sig);
    } else if (process.env.SUDOKU_STAGING === "1") {
      const tx = new Transaction().add(SystemProgram.transfer({
        fromPubkey: authority.publicKey,
        toPubkey: player,
        lamports: 50_000_000,
      }));
      tx.feePayer = authority.publicKey;
      tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
      tx.sign(authority);
      const raw = tx.serialize();
      await connection.sendRawTransaction(raw, { skipPreflight: false });
      await confirmSignature(bs58.encode(raw.subarray(1, 65)));
    } else {
      throw new Error("This wallet needs SOL for fees. Test-token airdrops are localnet only.");
    }
  }
  const token = await getOrCreateAssociatedTokenAccount(connection, authority, mint, player);
  if (token.amount < 5_000_000n) {
    const minter = local || process.env.SUDOKU_STAGING === "1" ? testSettlementMint() : authority;
    await mintTo(connection, authority, mint, token.address, minter, 5_000_000n);
  }
  return { mint: mint.toBase58(), token: token.address.toBase58() };
}

/** Unsigned open transaction. The player signs it before the match authority does. */
export function compileOpenDeposit(input: {
  programId: PublicKey;
  matchId: bigint;
  stake: bigint;
  player: PublicKey;
  authority: PublicKey;
  mint: PublicKey;
  joinBy: bigint;
  settleBy: bigint;
}): Transaction {
  const idBuf = Buffer.alloc(8);
  idBuf.writeBigUInt64LE(input.matchId);
  const [pda, bump] = PublicKey.findProgramAddressSync([Buffer.from("match"), idBuf], input.programId);
  const token = getAssociatedTokenAddressSync(input.mint, input.player);
  const vault = getAssociatedTokenAddressSync(input.mint, pda, true);
  const stake = Buffer.alloc(8);
  stake.writeBigUInt64LE(input.stake);
  const joinBy = Buffer.alloc(8);
  joinBy.writeBigInt64LE(input.joinBy);
  const settleBy = Buffer.alloc(8);
  settleBy.writeBigInt64LE(input.settleBy);
  const tx = new Transaction().add(new TransactionInstruction({
    programId: input.programId,
    keys: [
      { pubkey: pda, isSigner: false, isWritable: true },
      { pubkey: input.mint, isSigner: false, isWritable: false },
      { pubkey: token, isSigner: false, isWritable: true },
      { pubkey: vault, isSigner: false, isWritable: true },
      { pubkey: input.player, isSigner: true, isWritable: true },
      { pubkey: input.authority, isSigner: true, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([Buffer.from([0]), idBuf, stake, joinBy, settleBy, Buffer.from([bump])]),
  }));
  tx.feePayer = input.player;
  return tx;
}

/**
 * Checks a wallet-signed open transaction, then adds the authority signature to that same message.
 * A signature that is already present is kept. The instruction and blockhash are not replaced.
 */
export function coSignOpenDeposit(raw: string, authority: Keypair, expected: {
  programId: string;
  matchId: bigint;
  stake: bigint;
  player: string;
  mint: string;
  chainNow: bigint;
  joinWindow: bigint;
  settleWindow: bigint;
}): string {
  const tx = Transaction.from(restorePartialSignature(Buffer.from(raw, "base64")));
  if (tx.instructions.length !== 1) throw new Error("The deposit was changed before it was signed");
  const programId = new PublicKey(expected.programId);
  const player = new PublicKey(expected.player);
  const mint = new PublicKey(expected.mint);
  const idBuf = Buffer.alloc(8);
  idBuf.writeBigUInt64LE(expected.matchId);
  const [pda, bump] = PublicKey.findProgramAddressSync([Buffer.from("match"), idBuf], programId);
  const compiled = compileOpenDeposit({
    programId,
    matchId: expected.matchId,
    stake: expected.stake,
    player,
    authority: authority.publicKey,
    mint,
    joinBy: 0n,
    settleBy: 1n,
  });
  const ix = tx.instructions[0];
  const expectedKeys = compiled.instructions[0].keys;
  if (!ix.programId.equals(programId) || ix.keys.length !== expectedKeys.length) {
    throw new Error("The deposit accounts were changed");
  }
  for (let i = 0; i < expectedKeys.length; i += 1) {
    const got = ix.keys[i];
    const want = expectedKeys[i];
    if (!got.pubkey.equals(want.pubkey) || got.isSigner !== want.isSigner || got.isWritable !== want.isWritable) {
      throw new Error("The deposit accounts were changed");
    }
  }
  if (ix.data.length !== 34 || ix.data[0] !== 0 || ix.data.readBigUInt64LE(1) !== expected.matchId || ix.data.readBigUInt64LE(9) !== expected.stake || ix.data[33] !== bump) {
    throw new Error("The deposit does not match this room");
  }
  const joinBy = ix.data.readBigInt64LE(17);
  const settleBy = ix.data.readBigInt64LE(25);
  const slack = 180n;
  if (joinBy < expected.chainNow + expected.joinWindow - slack || joinBy > expected.chainNow + expected.joinWindow + 5n) {
    throw new Error("The deposit deadline does not match this room");
  }
  if (settleBy <= joinBy || settleBy < expected.chainNow + expected.settleWindow - slack || settleBy > expected.chainNow + expected.settleWindow + 5n) {
    throw new Error("The deposit deadline does not match this room");
  }
  if (!tx.feePayer?.equals(player)) throw new Error("The deposit fee payer is not the seated wallet");
  const message = Buffer.from(tx.serializeMessage());
  const playerSig = tx.signatures.find((item) => item.publicKey.equals(player))?.signature;
  if (!playerSig || !nacl.sign.detached.verify(message, playerSig, player.toBytes())) {
    throw new Error("The wallet signature does not match this deposit");
  }
  const existing = tx.signatures.find((item) => item.publicKey.equals(authority.publicKey))?.signature;
  if (existing) {
    if (!nacl.sign.detached.verify(message, existing, authority.publicKey.toBytes())) {
      throw new Error("The deposit signature does not match this room");
    }
  } else {
    tx.partialSign(authority);
  }
  if (!Buffer.from(tx.serializeMessage()).equals(message)) throw new Error("The deposit changed while it was being signed");
  if (!tx.verifySignatures()) throw new Error("The deposit signatures do not match");
  if (!pda.equals(expectedKeys[0].pubkey)) throw new Error("The deposit accounts were changed");
  return Buffer.from(tx.serialize()).toString("base64");
}

export async function coSignSubmittedDeposit(raw: string, matchId: string, wallet: string, limitMs: number, programId: string | undefined, stake: bigint): Promise<string> {
  const { authority, mint } = await ensureChain();
  const clock = await connection.getAccountInfo(new PublicKey("SysvarC1ock11111111111111111111111111111111"));
  if (!clock) throw new Error("The deposit clock is unavailable");
  const local = RPC.includes("127.0.0.1");
  return coSignOpenDeposit(raw, authority, {
    programId: programOf(programId).toBase58(),
    matchId: BigInt(matchId),
    stake,
    player: wallet,
    mint: mint.toBase58(),
    chainNow: clock.data.readBigInt64LE(32),
    joinWindow: local ? 45n : 600n,
    settleWindow: local ? 120n : BigInt(Math.ceil(limitMs / 1000) + 300),
  });
}

export async function buildDeposit(matchId: string, wallet: string, role: "open" | "join", limitMs: number, programId?: string, stakeAmount: bigint = STAKE) {
  const { authority, mint } = await ensureChain();
  const idBuf = Buffer.alloc(8);
  idBuf.writeBigUInt64LE(BigInt(matchId));
  const [pda] = PublicKey.findProgramAddressSync([Buffer.from("match"), idBuf], programOf(programId));
  const player = new PublicKey(wallet);
  const vault = getAssociatedTokenAddressSync(mint, pda, true);
  const clock = (await connection.getAccountInfo(new PublicKey("SysvarC1ock11111111111111111111111111111111")))!;
  const chainNow = clock.data.readBigInt64LE(32);
  const local = RPC.includes("127.0.0.1");
  const tx = role === "open"
    ? compileOpenDeposit({
        programId: programOf(programId),
        matchId: BigInt(matchId),
        stake: stakeAmount,
        player,
        authority: authority.publicKey,
        mint,
        joinBy: chainNow + (local ? 45n : 600n),
        settleBy: chainNow + (local ? 120n : BigInt(Math.ceil(limitMs / 1000) + 300)),
      })
    : new Transaction().add(new TransactionInstruction({
        programId: programOf(programId),
        keys: [
          { pubkey: pda, isSigner: false, isWritable: true },
          { pubkey: mint, isSigner: false, isWritable: false },
          { pubkey: getAssociatedTokenAddressSync(mint, player), isSigner: false, isWritable: true },
          { pubkey: vault, isSigner: false, isWritable: true },
          { pubkey: player, isSigner: true, isWritable: true },
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        ],
        data: Buffer.from([1]),
      }));
  if (role === "join") tx.feePayer = player;
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  return {
    tx: tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString("base64"),
    vault: vault.toBase58(),
  };
}

export function interpretDeposit(known: "confirmed" | "failed" | "unknown", vaultCovers: boolean, blockhashExpired: boolean): "ok" | "failed" | "expired" | "retry" {
  if (known === "failed") return "failed";
  if (known === "confirmed" || vaultCovers) return "ok";
  if (blockhashExpired) return "expired";
  return "retry";
}

export async function submitDeposit(raw: string, vault: string, expected: bigint) {
  const bytes = Buffer.from(raw, "base64");
  const signature = payerSignature(bytes);
  const known = await signatureState(signature);
  if (known === "failed") throw new Error("The submitted deposit failed on-chain and did not move the stake");
  const landed = await getAccount(connection, new PublicKey(vault)).catch(() => null);
  if (known === "confirmed" || (landed && landed.amount >= expected)) {
    if (!landed || landed.amount < expected) throw new Error("Vault balance is below the stake");
    return signature;
  }
  try {
    await connection.sendRawTransaction(bytes, { skipPreflight: false });
    await confirmSignature(signature);
  } catch (error) {
    const after = await getAccount(connection, new PublicKey(vault)).catch(() => null);
    const decision = interpretDeposit(await signatureState(signature), Boolean(after && after.amount >= expected), expired(error));
    if (decision === "ok") return signature;
    if (decision === "expired") throw new Error("The signed deposit expired before confirmation. It did not move funds. Sign a new deposit.");
    if (decision === "retry") throw new Error("Deposit status is unknown. The same signature will be checked again.");
    throw error;
  }
  const account = await getAccount(connection, new PublicKey(vault));
  if (account.amount < expected) throw new Error("Vault balance is below the stake");
  return signature;
}

/** A signed deposit must still name this app's authority, mint, and stake. */
export async function assertDepositBound(matchId: string, wallet: string, role: "open" | "join", programId?: string, stakeAmount: bigint = STAKE): Promise<void> {
  const { authority, mint } = await ensureChain();
  const idBuf = Buffer.alloc(8);
  idBuf.writeBigUInt64LE(BigInt(matchId));
  const [pda] = PublicKey.findProgramAddressSync([Buffer.from("match"), idBuf], programOf(programId));
  const info = await connection.getAccountInfo(pda);
  if (!info || !info.owner.equals(programOf(programId))) throw new Error("The deposit is not on the match account");
  const accepted = matchRecordAcceptsDeposit(info.data, {
    authority: authority.publicKey.toBytes(),
    mint: mint.toBytes(),
    stake: stakeAmount,
    player: new PublicKey(wallet).toBytes(),
    role,
  });
  if (!accepted) throw new Error("The deposit does not match this room");
}

export async function settleMatch(matchId: string, walletA: string, walletB: string, outcome: number, programId?: string) {
  const { authority, mint } = await ensureChain();
  const idBuf = Buffer.alloc(8);
  idBuf.writeBigUInt64LE(BigInt(matchId));
  const [pda] = PublicKey.findProgramAddressSync([Buffer.from("match"), idBuf], programOf(programId));
  const vault = getAssociatedTokenAddressSync(mint, pda, true);
  const tokenA = getAssociatedTokenAddressSync(mint, new PublicKey(walletA));
  const tokenB = getAssociatedTokenAddressSync(mint, new PublicKey(walletB));
  const ix = new TransactionInstruction({
    programId: programOf(programId),
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
  const existing = await connection.getAccountInfo(pda);
  if (existing && existing.data[160] === 2) return "already-settled";
  const tx = new Transaction().add(ix);
  tx.feePayer = authority.publicKey;
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  tx.sign(authority);
  const raw = tx.serialize();
  const signature = payerSignature(raw);
  await connection.sendRawTransaction(raw, { skipPreflight: false });
  return signature;
}

export async function transactionStatus(signature: string): Promise<"confirmed" | "failed" | "unknown"> {
  return signatureState(signature);
}

export async function buildCancel(matchId: string, walletA: string, walletB: string | null, signer: string, programId?: string) {
  const { mint } = await ensureChain();
  const idBuf = Buffer.alloc(8);
  idBuf.writeBigUInt64LE(BigInt(matchId));
  const [pda] = PublicKey.findProgramAddressSync([Buffer.from("match"), idBuf], programOf(programId));
  const vault = getAssociatedTokenAddressSync(mint, pda, true);
  const tokenA = getAssociatedTokenAddressSync(mint, new PublicKey(walletA));
  const tokenB = walletB ? getAssociatedTokenAddressSync(mint, new PublicKey(walletB)) : tokenA;
  const player = new PublicKey(signer);
  const before = await getAccount(connection, signer === walletA ? tokenA : tokenB);
  const ix = new TransactionInstruction({
    programId: programOf(programId),
    keys: [
      { pubkey: pda, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: vault, isSigner: false, isWritable: true },
      { pubkey: tokenA, isSigner: false, isWritable: true },
      { pubkey: tokenB, isSigner: false, isWritable: true },
      { pubkey: player, isSigner: true, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.from([3]),
  });
  const tx = new Transaction().add(ix);
  tx.feePayer = player;
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  return {
    tx: tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString("base64"),
    pda: pda.toBase58(),
    before: before.amount.toString(),
    token: (signer === walletA ? tokenA : tokenB).toBase58(),
  };
}

export async function buildClose(matchId: string, walletA: string, signer: string, programId?: string) {
  if (signer !== walletA) throw new Error("Only the player who opened the match can close it");
  const { mint } = await ensureChain();
  const idBuf = Buffer.alloc(8);
  idBuf.writeBigUInt64LE(BigInt(matchId));
  const [pda] = PublicKey.findProgramAddressSync([Buffer.from("match"), idBuf], programOf(programId));
  const info = await connection.getAccountInfo(pda);
  if (!info) return { tx: null, pda: pda.toBase58(), alreadyClosed: true };
  const status = info.data[160];
  if (status !== 2 && status !== 3) throw new Error("Close is available after settlement or refund");
  const vault = getAssociatedTokenAddressSync(mint, pda, true);
  const held = await getAccount(connection, vault);
  if (held.amount !== 0n) throw new Error("The vault still holds tokens");
  const player = new PublicKey(signer);
  const ix = new TransactionInstruction({
    programId: programOf(programId),
    keys: [
      { pubkey: pda, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: vault, isSigner: false, isWritable: true },
      { pubkey: player, isSigner: true, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.from([4]),
  });
  const tx = new Transaction().add(ix);
  tx.feePayer = player;
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  return {
    tx: tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString("base64"),
    pda: pda.toBase58(),
    alreadyClosed: false,
  };
}

export async function submitClose(raw: string, pda: string) {
  const bytes = Buffer.from(raw, "base64");
  const signature = payerSignature(bytes);
  const existing = await connection.getAccountInfo(new PublicKey(pda));
  if (!existing) return { signature, closed: true };
  const known = await signatureState(signature);
  if (known === "failed") throw new Error("The submitted close failed on-chain");
  if (known !== "confirmed") {
    await connection.sendRawTransaction(bytes, { skipPreflight: false });
    await confirmSignature(signature);
  }
  if (await connection.getAccountInfo(new PublicKey(pda))) throw new Error("The match account is still open");
  return { signature, closed: true };
}

export async function submitCancel(raw: string, pda: string, token: string, before: bigint) {
  const bytes = Buffer.from(raw, "base64");
  const signature = payerSignature(bytes);
  const existing = await connection.getAccountInfo(new PublicKey(pda));
  if (existing?.data[160] === 3) {
    const after = (await getAccount(connection, new PublicKey(token))).amount;
    return { signature, paid: false, amount: after.toString() };
  }
  const known = await signatureState(signature);
  if (known === "failed") throw new Error("The submitted refund failed on-chain");
  if (known !== "confirmed") {
    try {
      await connection.sendRawTransaction(bytes, { skipPreflight: false });
      await confirmSignature(signature);
    } catch (error) {
      const now = await connection.getAccountInfo(new PublicKey(pda));
      if (now?.data[160] !== 3) throw error;
    }
  }
  const match = await connection.getAccountInfo(new PublicKey(pda));
  if (!match || match.data[160] !== 3) throw new Error("Refund was not confirmed on-chain");
  const after = (await getAccount(connection, new PublicKey(token))).amount;
  return { signature, paid: after > before, amount: after.toString() };
}

export function payerSignature(bytes: Uint8Array): string {
  const count = bytes[0];
  if (count < 1 || count > 2) throw new Error("Expected a player signature");
  return bs58.encode(bytes.subarray(1, 65));
}

async function confirmSignature(signature: string): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < 20_000) {
    const state = await signatureState(signature);
    if (state === "confirmed") return;
    if (state === "failed") throw new Error("Transaction failed on-chain");
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error("Transaction status is unknown. The same signature will be checked again.");
}

async function signatureState(signature: string): Promise<"confirmed" | "failed" | "unknown"> {
  const status = await connection.getSignatureStatuses([signature]);
  const value = status.value[0];
  if (!value) return "unknown";
  if (value.err) return "failed";
  if (value.confirmationStatus === "confirmed" || value.confirmationStatus === "finalized") return "confirmed";
  return "unknown";
}

function expired(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /blockhash|expired|not found/i.test(message);
}

export async function escrowStatus(matchId: string, programId?: string): Promise<number | null> {
  const idBuf = Buffer.alloc(8);
  idBuf.writeBigUInt64LE(BigInt(matchId));
  const [pda] = PublicKey.findProgramAddressSync([Buffer.from("match"), idBuf], programOf(programId));
  const info = await connection.getAccountInfo(pda);
  return info ? info.data[160] : null;
}

export async function settlementOpen(matchId: string, programId?: string): Promise<boolean> {
  if ((await escrowStatus(matchId, programId)) !== 1) return false;
  const idBuf = Buffer.alloc(8);
  idBuf.writeBigUInt64LE(BigInt(matchId));
  const [pda] = PublicKey.findProgramAddressSync([Buffer.from("match"), idBuf], programOf(programId));
  const info = await connection.getAccountInfo(pda);
  if (!info) return false;
  const clock = await connection.getAccountInfo(new PublicKey("SysvarC1ock11111111111111111111111111111111"));
  const now = clock ? Number(clock.data.readBigInt64LE(32)) : Math.floor(Date.now() / 1000);
  return now < Number(info.data.readBigInt64LE(152));
}

export async function matchFunds(matchId: string, walletA: string, walletB: string | null, programId?: string) {
  const { mint } = await ensureChain();
  const idBuf = Buffer.alloc(8);
  idBuf.writeBigUInt64LE(BigInt(matchId));
  const [pda] = PublicKey.findProgramAddressSync([Buffer.from("match"), idBuf], programOf(programId));
  const info = await connection.getAccountInfo(pda);
  const tokenA = getAssociatedTokenAddressSync(mint, new PublicKey(walletA));
  const balanceA = (await getAccount(connection, tokenA)).amount.toString();
  const balanceB = walletB ? (await getAccount(connection, getAssociatedTokenAddressSync(mint, new PublicKey(walletB)))).amount.toString() : null;
  return {
    status: info ? info.data[160] : null,
    outcome: info ? info.data[161] : null,
    joinDeadline: info ? Number(info.data.readBigInt64LE(144)) : null,
    settleDeadline: info ? Number(info.data.readBigInt64LE(152)) : null,
    balanceA,
    balanceB,
  };
}
