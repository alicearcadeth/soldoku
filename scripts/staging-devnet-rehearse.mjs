import { loadOperatorEnv } from "./operator-env.mjs";
/**
 * Deploys a new Devnet staging program and rehearses Open/Join/Settle/Close.
 * Uses Devnet test SOL only. Does not touch the public V2 program or Mainnet.
 * Prints public ids and outcomes. Never prints keys or RPC URLs.
 */
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
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
  SYSVAR_CLOCK_PUBKEY,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";

const here = dirname(fileURLToPath(import.meta.url));
function testMint() {
  const file = join(here, "../programs/match-escrow/fixtures/test-settlement-mint.json");
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(file, "utf8"))));
}
function closeIx(programId, match, mint, vault, playerA) {
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: match, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: vault, isSigner: false, isWritable: true },
      { pubkey: playerA, isSigner: true, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.from([4]),
  });
}

const FORBIDDEN = new Set([
  "4GqmVjmNLwfJ8UrtGTV9C2RZAqNqRiaGGmCsKRX7EKMH",
  "937BAWXVCW58oEKkA1FijkSXXtdgGEytUyPRV2Roge22",
  "HUkhJi8p1XXuErpEXkgpfQjwdapigXLECRoQSu3indyS",
]);
const DEVNET_GENESIS = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";
const LOADER = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");
const root = fileURLToPath(new URL("..", import.meta.url));
const artifact = join(root, "programs/match-escrow/target/deploy/match_escrow_test.so");
const env = loadOperatorEnv();
const rpc = env.ARTPORTAL_SOLANA_RPC_URL?.trim();
if (!rpc) throw new Error("missing devnet rpc");
const connection = new Connection(rpc, "confirmed");
connection.confirmTransaction = async (strategy) => {
  const signature = typeof strategy === "string" ? strategy : strategy.signature;
  const started = Date.now();
  while (Date.now() - started < 90_000) {
    const status = (await connection.getSignatureStatuses([signature])).value[0];
    if (status?.err) throw new Error(`transaction failed: ${JSON.stringify(status.err)}`);
    if (status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized") {
      return { context: { slot: status.slot }, value: { err: null } };
    }
    await new Promise((resolve) => setTimeout(resolve, 800));
  }
  throw new Error("confirmation timed out");
};
if (await connection.getGenesisHash() !== DEVNET_GENESIS) throw new Error("rpc is not devnet");

function keypair(name) {
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(join(homedir(), ".config", "solana", name), "utf8"))));
}

const program = keypair("sudoku-staging-program.json");
const upgrade = keypair("sudoku-staging-upgrade.json");
const devPayer = keypair("sudoku-dev.json");
if (FORBIDDEN.has(program.publicKey.toBase58())) throw new Error("refusing to deploy over a protected program");

function scrub(text) {
  return String(text).replace(/https?:\/\/\S+/g, "<rpc>");
}

async function fundStaging() {
  const balance = await connection.getBalance(upgrade.publicKey);
  if (balance >= 800_000_000) return { transferred: false, lamports: balance };
  const signature = await send([devPayer], SystemProgram.transfer({
    fromPubkey: devPayer.publicKey,
    toPubkey: upgrade.publicKey,
    lamports: 1_000_000_000,
  }));
  return { transferred: true, signature, lamports: await connection.getBalance(upgrade.publicKey) };
}

function toWsl(file) {
  const normal = file.replace(/\\/g, "/");
  const match = normal.match(/^([A-Za-z]):\/(.*)$/);
  return match ? `/mnt/${match[1].toLowerCase()}/${match[2]}` : normal;
}

function deploy() {
  const solana = process.env.SOLANA_BIN || "solana";
  const args = [
    "-e", solana, "program", "deploy", toWsl(artifact),
    "--url", rpc,
    "--program-id", toWsl(join(homedir(), ".config", "solana", "sudoku-staging-program.json")),
    "--keypair", toWsl(join(homedir(), ".config", "solana", "sudoku-staging-upgrade.json")),
    "--upgrade-authority", toWsl(join(homedir(), ".config", "solana", "sudoku-staging-upgrade.json")),
  ];
  return new Promise((resolve, reject) => {
    const child = spawn("wsl", args, { shell: false });
    let out = "";
    child.stdout.on("data", (chunk) => { out += chunk; });
    child.stderr.on("data", (chunk) => { out += chunk; });
    child.on("error", (error) => reject(error));
    child.on("exit", (code) => {
      const clean = scrub(out).slice(-1200);
      if (code === 0) resolve(clean);
      else reject(new Error(clean || `deploy exited ${code}`));
    });
  });
}

function authorityOf(data) {
  if (data[12] !== 1) return null;
  return new PublicKey(data.subarray(13, 45)).toBase58();
}

async function programReport() {
  const account = await connection.getAccountInfo(program.publicKey);
  if (!account) return { deployed: false };
  const programData = new PublicKey(account.data.subarray(4, 36));
  const data = await connection.getAccountInfo(programData);
  return {
    deployed: true,
    owner: account.owner.toBase58(),
    loader: account.owner.equals(LOADER),
    executable: account.executable,
    programData: programData.toBase58(),
    programDataBytes: data?.data.length ?? 0,
    upgradeAuthority: data ? authorityOf(data.data) : null,
    upgradeAuthorityMatches: data ? authorityOf(data.data) === upgrade.publicKey.toBase58() : false,
  };
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

async function send(signers, ix) {
  const tx = new Transaction().add(ix);
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.feePayer = signers[0].publicKey;
  tx.sign(...signers);
  const signature = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false });
  const started = Date.now();
  while (Date.now() - started < 60_000) {
    const status = (await connection.getSignatureStatuses([signature])).value[0];
    if (status?.err) throw new Error(`transaction failed: ${JSON.stringify(status.err)}`);
    if (status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized") return signature;
    await new Promise((resolve) => setTimeout(resolve, 800));
  }
  const landed = await connection.getTransaction(signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
  if (landed && !landed.meta?.err) return signature;
  throw new Error(`confirmation timed out before block ${lastValidBlockHeight}`);
}

async function expectFail(run) {
  try {
    await run();
  } catch (error) {
    return scrub(error instanceof Error ? error.message : error).slice(0, 180);
  }
  throw new Error("malformed open was accepted");
}

async function rehearse() {
  const playerA = Keypair.generate();
  const playerB = Keypair.generate();
  const rent = 80_000_000;
  await send([upgrade], SystemProgram.transfer({ fromPubkey: upgrade.publicKey, toPubkey: playerA.publicKey, lamports: rent }));
  await send([upgrade], SystemProgram.transfer({ fromPubkey: upgrade.publicKey, toPubkey: playerB.publicKey, lamports: rent }));
  const mintKey = testMint();
  const existing = await connection.getAccountInfo(mintKey.publicKey);
  const mint = existing ? mintKey.publicKey : await createMint(connection, upgrade, mintKey.publicKey, null, 6, mintKey);
  const wrong = await createMint(connection, upgrade, upgrade.publicKey, null, 6);
  const tokenA = (await getOrCreateAssociatedTokenAccount(connection, playerA, mint, playerA.publicKey)).address;
  const tokenB = (await getOrCreateAssociatedTokenAccount(connection, playerB, mint, playerB.publicKey)).address;
  await mintTo(connection, upgrade, mint, tokenA, mintKey, 3_000_000n);
  await mintTo(connection, upgrade, mint, tokenB, mintKey, 3_000_000n);
  const clock = (await connection.getAccountInfo(SYSVAR_CLOCK_PUBKEY)).data.readBigInt64LE(32);
  let sequence = BigInt(Date.now());
  const next = () => {
    sequence += 1n;
    const id = u64(sequence);
    const [pda, bump] = PublicKey.findProgramAddressSync([Buffer.from("match"), id], program.publicKey);
    return { idBuf: id, pda, bump, vault: getAssociatedTokenAddressSync(mint, pda, true) };
  };
  const openIx = (match, token, mintAccount, joinBy, settleBy, stake = 1_000_000n) => new TransactionInstruction({
    programId: program.publicKey,
    keys: [
      { pubkey: match.pda, isSigner: false, isWritable: true },
      { pubkey: mintAccount, isSigner: false, isWritable: false },
      { pubkey: token, isSigner: false, isWritable: true },
      { pubkey: match.vault, isSigner: false, isWritable: true },
      { pubkey: playerA.publicKey, isSigner: true, isWritable: true },
      { pubkey: upgrade.publicKey, isSigner: true, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([Buffer.from([0]), match.idBuf, u64(stake), i64(joinBy), i64(settleBy), Buffer.from([match.bump])]),
  });
  const opened = next();
  const wrongMint = await expectFail(() => send([playerA, upgrade], openIx(opened, tokenA, wrong, clock + 600n, clock + 1200n)));
  const match = next();
  await send([playerA, upgrade], openIx(match, tokenA, mint, clock + 600n, clock + 1200n));
  await send([playerB], new TransactionInstruction({
    programId: program.publicKey,
    keys: [
      { pubkey: match.pda, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: tokenB, isSigner: false, isWritable: true },
      { pubkey: match.vault, isSigner: false, isWritable: true },
      { pubkey: playerB.publicKey, isSigner: true, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.from([1]),
  }));
  await send([upgrade], new TransactionInstruction({
    programId: program.publicKey,
    keys: [
      { pubkey: match.pda, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: match.vault, isSigner: false, isWritable: true },
      { pubkey: tokenA, isSigner: false, isWritable: true },
      { pubkey: tokenB, isSigner: false, isWritable: true },
      { pubkey: upgrade.publicKey, isSigner: true, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.from([2, 1]),
  }));
  const vaultAfterSettle = (await getAccount(connection, match.vault)).amount.toString();
  const winner = (await getAccount(connection, tokenA)).amount.toString();
  const matchLamports = (await connection.getAccountInfo(match.pda)).lamports;
  const vaultLamports = (await connection.getAccountInfo(match.vault)).lamports;
  const beforeClose = await connection.getBalance(playerA.publicKey);
  await send([playerA], closeIx(program.publicKey, match.pda, mint, match.vault, playerA.publicKey));
  const afterClose = await connection.getBalance(playerA.publicKey);
  const refundClock = (await connection.getAccountInfo(SYSVAR_CLOCK_PUBKEY)).data.readBigInt64LE(32);
  const refund = next();
  await send([playerA, upgrade], openIx(refund, tokenA, mint, refundClock + 2n, refundClock + 30n));
  await new Promise((resolve) => setTimeout(resolve, 4_000));
  await send([playerA], new TransactionInstruction({
    programId: program.publicKey,
    keys: [
      { pubkey: refund.pda, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: refund.vault, isSigner: false, isWritable: true },
      { pubkey: tokenA, isSigner: false, isWritable: true },
      { pubkey: tokenB, isSigner: false, isWritable: true },
      { pubkey: playerA.publicKey, isSigner: true, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.from([3]),
  }));
  await send([playerA], closeIx(program.publicKey, refund.pda, mint, refund.vault, playerA.publicKey));
  const wrongPlayer = await expectFail(() => send([playerB, upgrade], openIx(next(), tokenB, mint, clock + 600n, clock + 1200n)));
  const drawn = next();
  const beforeDrawA = (await getAccount(connection, tokenA)).amount;
  const beforeDrawB = (await getAccount(connection, tokenB)).amount;
  await send([playerA, upgrade], openIx(drawn, tokenA, mint, clock + 900n, clock + 1800n));
  await send([playerB], new TransactionInstruction({
    programId: program.publicKey,
    keys: [
      { pubkey: drawn.pda, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: tokenB, isSigner: false, isWritable: true },
      { pubkey: drawn.vault, isSigner: false, isWritable: true },
      { pubkey: playerB.publicKey, isSigner: true, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.from([1]),
  }));
  await send([upgrade], new TransactionInstruction({
    programId: program.publicKey,
    keys: [
      { pubkey: drawn.pda, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: drawn.vault, isSigner: false, isWritable: true },
      { pubkey: tokenA, isSigner: false, isWritable: true },
      { pubkey: tokenB, isSigner: false, isWritable: true },
      { pubkey: upgrade.publicKey, isSigner: true, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.from([2, 3]),
  }));
  const drawVault = (await getAccount(connection, drawn.vault)).amount.toString();
  const drawA = ((await getAccount(connection, tokenA)).amount - beforeDrawA).toString();
  const drawB = ((await getAccount(connection, tokenB)).amount - beforeDrawB).toString();
  await send([playerA], closeIx(program.publicKey, drawn.pda, mint, drawn.vault, playerA.publicKey));
  const deadline = next();
  const deadlineClock = (await connection.getAccountInfo(SYSVAR_CLOCK_PUBKEY)).data.readBigInt64LE(32);
  await send([playerA, upgrade], openIx(deadline, tokenA, mint, deadlineClock + 40n, deadlineClock + 48n));
  await send([playerB], new TransactionInstruction({
    programId: program.publicKey,
    keys: [
      { pubkey: deadline.pda, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: tokenB, isSigner: false, isWritable: true },
      { pubkey: deadline.vault, isSigner: false, isWritable: true },
      { pubkey: playerB.publicKey, isSigner: true, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.from([1]),
  }));
  const premature = await expectFail(() => send([playerA], new TransactionInstruction({
    programId: program.publicKey,
    keys: [
      { pubkey: deadline.pda, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: deadline.vault, isSigner: false, isWritable: true },
      { pubkey: tokenA, isSigner: false, isWritable: true },
      { pubkey: tokenB, isSigner: false, isWritable: true },
      { pubkey: playerA.publicKey, isSigner: true, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.from([3]),
  })));
  while ((await connection.getAccountInfo(SYSVAR_CLOCK_PUBKEY)).data.readBigInt64LE(32) <= deadlineClock + 48n) {
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  await send([playerA], new TransactionInstruction({
    programId: program.publicKey,
    keys: [
      { pubkey: deadline.pda, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: deadline.vault, isSigner: false, isWritable: true },
      { pubkey: tokenA, isSigner: false, isWritable: true },
      { pubkey: tokenB, isSigner: false, isWritable: true },
      { pubkey: playerA.publicKey, isSigner: true, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.from([3]),
  }));
  const deadlineVault = (await getAccount(connection, deadline.vault)).amount.toString();
  await send([playerA], closeIx(program.publicKey, deadline.pda, mint, deadline.vault, playerA.publicKey));
  return {
    label: "STAGING / DEVNET / NO CASH VALUE",
    wrongMintRejected: wrongMint.slice(0, 80),
    wrongPlayerRejected: wrongPlayer.slice(0, 80),
    prematureRefundRejected: premature.slice(0, 80),
    vaultAfterSettle,
    winnerTokens: winner,
    drawVault,
    drawA,
    drawB,
    deadlineVault,
    matchLamports,
    vaultLamports,
    closeLamportDelta: afterClose - beforeClose,
    accountsClosed:
      (await connection.getAccountInfo(match.pda)) === null &&
      (await connection.getAccountInfo(refund.pda)) === null &&
      (await connection.getAccountInfo(drawn.pda)) === null &&
      (await connection.getAccountInfo(deadline.pda)) === null,
  };
}

const funding = await fundStaging();
let report = await programReport();
let deployLog = "already-deployed";
if (!report.deployed) {
  deployLog = await deploy();
  report = await programReport();
}
const flow = report.deployed && report.upgradeAuthorityMatches ? await rehearse() : { skipped: true };
const summary = {
  label: "STAGING / DEVNET / NO CASH VALUE",
  cluster: "devnet",
  cashValue: false,
  programId: program.publicKey.toBase58(),
  upgradeAuthority: upgrade.publicKey.toBase58(),
  matchAuthority: upgrade.publicKey.toBase58(),
  mint: testMint().publicKey.toBase58(),
  funding: { transferred: funding.transferred, lamports: funding.lamports },
  program: report,
  deployLog: deployLog.includes("Program Id") ? "deployed" : deployLog.slice(0, 400),
  flow,
};
if (flow.accountsClosed) {
  writeFileSync(join(here, "../config/staging.json"), JSON.stringify({
    label: summary.label,
    cluster: "devnet",
    cashValue: false,
    programId: summary.programId,
    upgradeAuthority: summary.upgradeAuthority,
    matchAuthority: summary.matchAuthority,
    mint: summary.mint,
  }, null, 2));
}
console.log(JSON.stringify(summary, null, 2));
