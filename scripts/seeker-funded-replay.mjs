/** Replay already-finalized Seeker claims on Devnet only and prove zero TEST delta. */
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {Connection,PublicKey} from '@solana/web3.js';
import {getAccount,getAssociatedTokenAddressSync} from '@solana/spl-token';
const c=new Connection('https://api.devnet.solana.com','finalized');
assert.equal(await c.getGenesisHash(),'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG');
const phone=new PublicKey('E3DQypoRXpB47tgSNdjdWgjvVyn3PYPHLut5j2S7DpJn');
const mint=new PublicKey('BtdrgokAvXQE4yj3zS48c4ktnMSy3TGoRkHCWD5fV8U4');
const program='6uuszYMoZ2bBX8oVccpYPUgdhW6CSvASziN2m8LpJxYs';
const rooms=process.env.SEEKER_REPLAY_ROOMS?JSON.parse(process.env.SEEKER_REPLAY_ROOMS):[{code:'FE65DD6D',escrow:'9CnVK49t9ezyDAs4ZZ2of7iakjvdPzbkB8MagkFqnUwq',tag:4},{code:'E571262D',escrow:'H2TJmpAgAcBFp2gAUKeK1S7ue4CehAxB7BPj62Ec46G9',tag:5}];
const receipts=[];
for(const room of rooms){
 const rows=await c.getSignaturesForAddress(new PublicKey(room.escrow),{limit:12});
 let found;
 for(const row of rows){if(row.err||row.confirmationStatus!=='finalized')continue;const tx=await c.getTransaction(row.signature,{commitment:'finalized',maxSupportedTransactionVersion:0});if(!tx)continue;
  const msg=tx.transaction.message;
  if(!msg.staticAccountKeys[0].equals(phone))continue;
  if(!msg.compiledInstructions.some(i=>msg.staticAccountKeys[i.programIdIndex].toBase58()===program&&i.data[0]===room.tag))continue;
  found={row,tx};break;
 }
 assert(found,`No finalized physical claim found for ${room.code}`);
 const ata=getAssociatedTokenAddressSync(mint,phone);
 const before=(await getAccount(c,ata,'finalized')).amount;
 let replay;
 if(process.argv.includes('--replay-finalized')){
  try{const wire=await fetch('https://api.devnet.solana.com',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'getTransaction',params:[found.row.signature,{encoding:'base64',commitment:'finalized',maxSupportedTransactionVersion:0}]})}).then(r=>r.json());assert.equal(wire.error,undefined);assert.equal(wire.result.transaction[1],'base64');const signature=await c.sendRawTransaction(Buffer.from(wire.result.transaction[0],'base64'),{skipPreflight:false});assert.equal(signature,found.row.signature);replay={signature};}catch(error){const message=String(error.message);assert.match(message,/already processed|Blockhash not found|blockhash.*not.*found/i);replay={rejected:message};}
 }
 const after=(await getAccount(c,ata,'finalized')).amount;
 assert.equal(after,before,'Finalized replay changed wallet TEST balance');
 const vault=(await getAccount(c,getAssociatedTokenAddressSync(mint,new PublicKey(room.escrow),true),'finalized')).amount;
 assert.equal(vault,0n,`${room.code} still has outstanding TEST`);
 receipts.push({code:room.code,signature:found.row.signature,confirmationStatus:'finalized',err:found.row.err,slot:found.row.slot,fee:found.tx.meta.fee,preTokenBalances:found.tx.meta.preTokenBalances,postTokenBalances:found.tx.meta.postTokenBalances,replay,before:before.toString(),after:after.toString(),replayDelta:(after-before).toString(),vaultAmount:vault.toString()});
}
writeFileSync(process.env.SEEKER_REPLAY_OUT??'docs/evidence/2026-10-09-seeker-relay-fixed-physical/physical-claim-replay.json',JSON.stringify({observedAt:new Date().toISOString(),receipts},null,2));
console.log(JSON.stringify(receipts.map(({code,signature,confirmationStatus,replayDelta,vaultAmount})=>({code,signature,confirmationStatus,replayDelta,vaultAmount}))));

