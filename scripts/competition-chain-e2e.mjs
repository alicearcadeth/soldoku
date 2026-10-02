// Real local-validator token transfers. No mocked RPC, balances, signatures, or program execution.
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, openSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, SystemProgram, sendAndConfirmTransaction } from '@solana/web3.js';
import { createMint, getOrCreateAssociatedTokenAccount, mintTo, getAccount, getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from '@solana/spl-token';

const directory = mkdtempSync(join(tmpdir(), 'soldoku-chain-'));
const connection = new Connection('http://127.0.0.1:8879', 'confirmed');
const payer = Keypair.generate(), authority = Keypair.generate(), program = Keypair.generate();
const wallets = [Keypair.generate(), Keypair.generate(), Keypair.generate()];
const STAKE = 1_000_000n;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const keyFile = (name, key) => { const path = join(directory, name); writeFileSync(path, JSON.stringify([...key.secretKey]), {mode:0o600}); return path; };
const payerPath = keyFile('payer.json', payer), programPath = keyFile('program.json', program);
const log = openSync(join(directory, 'validator.log'), 'a');
const validator = spawn('solana-test-validator', ['--ledger', join(directory, 'ledger'), '--rpc-port', '8879', '--faucet-port', '9979', '--bind-address', '127.0.0.1', '--quiet'], {stdio:['ignore', log, log]});
let validatorFailure;
validator.on('error', error => { validatorFailure = error; });
function u64(value) { const bytes = Buffer.alloc(8); bytes.writeBigUInt64LE(BigInt(value)); return bytes; }
const meta = (pubkey, isWritable=false, isSigner=false) => ({pubkey, isWritable, isSigner});
const ix = (opcode, keys, args=Buffer.alloc(0)) => new TransactionInstruction({programId:program.publicKey, keys, data:Buffer.concat([Buffer.from([opcode]), args])});
async function send(instructions, signers=[payer]) {
  return sendAndConfirmTransaction(connection, new Transaction().add(...instructions), signers, {commitment:'confirmed'});
}
async function fails(label, instruction, signers=[payer]) {
  let rejected = false;
  try { await send([instruction], signers); } catch (error) {
    // Require a program/instruction failure, not a network outage or signer setup mistake.
    rejected = /InstructionError|custom program error|simulation failed|Error processing Instruction/i.test(String(error));
    if (!rejected) throw error;
  }
  assert(rejected, `${label} must fail on-chain`); console.log(`PASS reject ${label}`);
}
const timestamp = async () => {
  const clock = await connection.getAccountInfo(new PublicKey('SysvarC1ock11111111111111111111111111111111'));
  return Number(clock.data.readBigInt64LE(32));
};
let mint;
function room(id, ends) {
  const [address] = PublicKey.findProgramAddressSync([Buffer.from('competition'),u64(id)],program.publicKey);
  const vault = getAssociatedTokenAddressSync(mint,address,true);
  const receipt = wallet => PublicKey.findProgramAddressSync([Buffer.from('entry'),address.toBuffer(),wallet.publicKey.toBuffer()],program.publicKey)[0];
  const source = wallet => getAssociatedTokenAddressSync(mint,wallet.publicKey);
  return {
    address, vault, receipt, source, ends,
    open: () => ix(0,[meta(address,true),meta(receipt(wallets[0]),true),meta(mint),meta(source(wallets[0]),true),meta(vault,true),meta(wallets[0].publicKey,true,true),meta(authority.publicKey,false,true),meta(TOKEN_PROGRAM_ID),meta(ASSOCIATED_TOKEN_PROGRAM_ID),meta(SystemProgram.programId)],Buffer.concat([u64(id),u64(STAKE),u64(ends),Buffer.alloc(32,7)])),
    join: wallet => ix(1,[meta(address,true),meta(receipt(wallet),true),meta(mint),meta(source(wallet),true),meta(vault,true),meta(wallet.publicKey,true,true),meta(TOKEN_PROGRAM_ID),meta(SystemProgram.programId)]),
    start: wallet => ix(2,[meta(address),meta(receipt(wallet),true),meta(wallet.publicKey,false,true)]),
    finish: (wallet,ms,signer=authority) => ix(3,[meta(address,true),meta(receipt(wallet),true),meta(signer.publicKey,false,true)],u64(ms)),
    settle: (winner=wallets[1]) => ix(4,[meta(address,true),meta(mint),meta(vault,true),meta(source(winner),true),meta(TOKEN_PROGRAM_ID)]),
    refund: wallet => ix(5,[meta(address,true),meta(receipt(wallet),true),meta(mint),meta(vault,true),meta(source(wallet),true),meta(TOKEN_PROGRAM_ID)]),
    extend: endsAt => ix(6,[meta(address,true),meta(wallets[0].publicKey,false,true)],u64(endsAt)),
  };
}
try {
  let ready = false;
  for (let i=0;i<60;i++) {
    if (validatorFailure) throw validatorFailure;
    if (validator.exitCode !== null) throw Error(`Validator exited ${validator.exitCode}; inspect ${directory}`);
    try { await connection.getVersion(); ready=true; break; } catch { await sleep(500); }
  }
  assert(ready,'validator started');
  const funding = await connection.requestAirdrop(payer.publicKey,10_000_000_000);
  const latest = await connection.getLatestBlockhash();
  await connection.confirmTransaction({...latest,signature:funding},'confirmed');
  await send(wallets.map(wallet=>SystemProgram.transfer({fromPubkey:payer.publicKey,toPubkey:wallet.publicKey,lamports:1_000_000_000})));
  const deployment = spawnSync('solana',['program','deploy','--url','http://127.0.0.1:8879','--keypair',payerPath,'--program-id',programPath,'programs/competition-escrow/target/deploy/competition_escrow.so'],{encoding:'utf8'});
  assert.equal(deployment.status,0,deployment.stderr);
  mint = await createMint(connection,payer,payer.publicKey,null,6);
  for (const wallet of wallets) {
    const token = await getOrCreateAssociatedTokenAccount(connection,payer,mint,wallet.publicKey);
    await mintTo(connection,payer,mint,token.address,payer,20_000_000n);
  }
  const end = await timestamp()+60;
  const competition = room(1,end), solo=room(2,end), noFinish=room(3,end);
  const unauthorizedOpen = competition.open();
  unauthorizedOpen.keys[6]=meta(authority.publicKey);
  await fails('unsigned authority',unauthorizedOpen,[wallets[0]]);
  await send([SystemProgram.transfer({fromPubkey:payer.publicKey,toPubkey:competition.address,lamports:1}),SystemProgram.transfer({fromPubkey:payer.publicKey,toPubkey:competition.receipt(wallets[1]),lamports:1})]);
  await send([competition.open()],[wallets[0],authority]);
  await fails('duplicate room',competition.open(),[wallets[0],authority]);
  await send([competition.extend(end+1)],[wallets[0]]);
  for (const wallet of wallets.slice(1)) await send([competition.join(wallet)],[wallet]);
  const account = await connection.getAccountInfo(competition.address);
  assert.equal(account.owner.toBase58(),program.publicKey.toBase58());
  assert.equal(account.data.readBigUInt64LE(160),3n);
  assert.equal((await getAccount(connection,competition.vault)).amount,3n*STAKE);
  console.log('PASS three real stakes / receipts / pool');
  console.log('PASS prefunded room and entry PDAs cannot block admission');
  const emptyWallet=Keypair.generate();
  await send([SystemProgram.transfer({fromPubkey:payer.publicKey,toPubkey:emptyWallet.publicKey,lamports:100_000_000})]);
  await getOrCreateAssociatedTokenAccount(connection,payer,mint,emptyWallet.publicKey);
  await fails('insufficient token balance',competition.join(emptyWallet),[emptyWallet]);
  assert.equal(await connection.getAccountInfo(competition.receipt(emptyWallet)),null,'failed join must leave no receipt');
  assert.equal((await getAccount(connection,competition.vault)).amount,3n*STAKE);
  await fails('duplicate join',competition.join(wallets[1]),[wallets[1]]);
  await fails('extend after join',competition.extend(end+30),[wallets[0]]);
  for (const wallet of wallets) await send([competition.start(wallet)],[wallet]);
  await fails('second start',competition.start(wallets[0]),[wallets[0]]);
  await fails('early result',competition.finish(wallets[0],15000),[authority]);
  await fails('client-signed result',competition.finish(wallets[0],15000,wallets[0]),[wallets[0]]);
  await fails('early settle',competition.settle());
  await fails('early refund',competition.refund(wallets[0]));
  await send([solo.open()],[wallets[0],authority]);
  await send([noFinish.open()],[wallets[0],authority]);
  await send([noFinish.join(wallets[1])],[wallets[1]]);
  const before = await Promise.all(wallets.map(async wallet=>(await getAccount(connection,competition.source(wallet))).amount));
  await sleep(17000);
  await send([competition.finish(wallets[0],17000)],[authority]);
  await send([competition.finish(wallets[1],16000)],[authority]);
  await fails('duplicate result',competition.finish(wallets[1],15500),[authority]);
  const ranked = await connection.getAccountInfo(competition.address);
  assert.equal(ranked.data.readBigUInt64LE(168),16000n);
  assert.equal(new PublicKey(ranked.data.subarray(176,208)).toBase58(),wallets[1].publicKey.toBase58());
  while (await timestamp() <= end+1) await sleep(500);
  await fails('late join',competition.join(wallets[0]),[wallets[0]]);
  await fails('late start',competition.start(wallets[2]),[wallets[2]]);
  await fails('late finish',competition.finish(wallets[2],20000),[authority]);
  await fails('wrong winner destination',competition.settle(wallets[0]));
  const paid = await send([competition.settle()]);
  assert.equal((await getAccount(connection,competition.vault)).amount,0n);
  const after = await Promise.all(wallets.map(async wallet=>(await getAccount(connection,competition.source(wallet))).amount));
  assert.deepEqual(after,[before[0],before[1]+3n*STAKE,before[2]]);
  await fails('duplicate settlement',competition.settle());
  await fails('refund paid room',competition.refund(wallets[0]));
  await send([solo.refund(wallets[0])]);
  await fails('duplicate refund',solo.refund(wallets[0]));
  for (const wallet of wallets.slice(0,2)) await send([noFinish.refund(wallet)]);
  assert.equal((await getAccount(connection,solo.vault)).amount,0n);
  assert.equal((await getAccount(connection,noFinish.vault)).amount,0n);
  console.log(JSON.stringify({result:'PASS',program:program.publicKey.toBase58(),players:wallets.map(w=>w.publicKey.toBase58()),payout:paid,scope:'local-validator; Devnet/browser evidence still required'}));
} finally { validator.kill('SIGTERM'); }
