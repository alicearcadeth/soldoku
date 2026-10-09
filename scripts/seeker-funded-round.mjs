import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import {Connection,Keypair,PublicKey,Transaction} from '@solana/web3.js';
import {getAssociatedTokenAddressSync,getAccount} from '@solana/spl-token';
const out='docs/evidence/2026-10-09-seeker-funded';mkdirSync(out,{recursive:true});mkdirSync('output',{recursive:true});
const file='output/seeker-funded-session.json';
const key=Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(join(homedir(),'.config/solana/sudoku-dev.json'),'utf8'))));
const phone='E3DQypoRXpB47tgSNdjdWgjvVyn3PYPHLut5j2S7DpJn';
const c=new Connection('https://api.devnet.solana.com','finalized');
assert.equal(await c.getGenesisHash(),'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG');
const cfg=await fetch('https://soldoku.com/api/competitions/config').then(r=>r.json());assert.equal(cfg.cluster,'devnet');
async function api(path,body){const r=await fetch(`https://soldoku.com/api/competitions${path}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});const j=await r.json();if(!r.ok)throw Error(j.error??`HTTP ${r.status}`);return j;}
const save=(s)=>writeFileSync(file,JSON.stringify(s)); // Session tokens remain in gitignored output only.
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function pause(value){const r=spawnSync('cmd.exe',['/d','/s','/c','npx wrangler secret put SUDOKU_COMPETITION_PAUSED --config wrangler.soldoku.jsonc'],{input:`${value}\n`,encoding:'utf8',windowsHide:true});assert.equal(r.status,0,'pause change failed');for(let i=0;i<20;i++){const p=await fetch('https://soldoku.com/api/competitions/config').then(r=>r.json());if(p.paused===(value==='1'))return;await delay(3000);}throw Error('pause verification failed');}
async function relay(code,actor,action){const p=await api('/transaction',{code,actor,action});const tx=Transaction.from(Buffer.from(p.transaction,'base64'));assert.equal(tx.feePayer.toBase58(),key.publicKey.toBase58());tx.partialSign(key);const {signature}=await api('/submit',{code,actor,action,transaction:tx.serialize().toString('base64')});for(let i=0;i<80;i++){const st=(await c.getSignatureStatuses([signature],{searchTransactionHistory:true})).value[0];if(st?.err)throw Error('transaction failed');if(st?.confirmationStatus==='finalized')return signature;await delay(1500);}throw Error(`transaction pending ${signature}`);}
async function amounts(){const mint=new PublicKey(cfg.mint);return Promise.all([phone,key.publicKey.toBase58()].map(async wallet=>{let amount='0';try{amount=(await getAccount(c,getAssociatedTokenAddressSync(mint,new PublicKey(wallet)))).amount.toString();}catch{}return {wallet,test:amount};}));}
if(process.argv[2]==='prepare'){
 assert.equal(cfg.paused,true);const release=await fetch('https://soldoku.com/api/release').then(r=>r.json());assert.equal(release.commit,'0b3055bebe3d700c7c77fc869214261ab05d8817');
 const p=await api('/proof',{wallet:key.publicKey.toBase58()});const auth=await api('/authorize',{id:p.id,signature:bs58.encode(nacl.sign.detached(new TextEncoder().encode(p.message),key.secretKey))});
 const s={actor:auth.actor,rooms:[],before:await amounts(),release:release.commit};save(s);
 try{
  await pause('0');
  for(const name of ['Seeker funded winner','Seeker funded refund']){
   const gate=await api('/check',{actor:s.actor});await api('/check/verify',{actor:s.actor,id:gate.id,value:gate.target});
   const room=await api('/create',{actor:s.actor,gateId:gate.id,mode:'tokens',mint:cfg.mint,stakeUnits:'1000000',level:'easy',durationMs:300000,name});
   s.rooms.push({code:room.code,name,startsAt:room.funded.startsAt,endsAt:room.endsAt});save(s);
   const signature=await relay(room.code,s.actor,'deposit');s.rooms.at(-1).ownerDeposit=signature;save(s);
   console.log(JSON.stringify({code:room.code,name,startsAt:room.funded.startsAt,endsAt:room.endsAt,ownerDeposit:signature}));
  }
  const limit=Math.min(Date.now()+9*60000,...s.rooms.map(r=>r.startsAt-15000));
  while(Date.now()<limit){const rooms=await Promise.all(s.rooms.map(r=>api('/sync',{code:r.code,actor:s.actor})));if(rooms.every(r=>r.participants===2)){s.depositsComplete=true;save(s);break;}await delay(10000);}
 }finally{await pause('1');s.pausedRestored=true;save(s);console.log('PAUSE RESTORED');}
}else{
 const s=JSON.parse(readFileSync(file,'utf8'));
 if(process.argv[2]==='pause'){await pause('1');s.pausedRestored=true;save(s);console.log('PAUSE RESTORED');}
 if(process.argv[2]==='refund-other'){const r=s.rooms[1];r.ownerRefund=await relay(r.code,s.actor,'claim');save(s);}
 if(process.argv[2]==='cleanup-solo'){
  for(const r of s.rooms){const state=await api('/sync',{code:r.code,actor:s.actor});if(state.participants!==1||state.you?.claimed)continue;assert(Date.now()>=state.funded.startsAt,'solo refund not available before registration closes');r.ownerRefund=await relay(r.code,s.actor,'claim');save(s);console.log(`Solo stake refunded: ${r.code}`);}
 }
 if(process.argv[2]==='duplicates'){
  const before=await amounts();
  for(const r of s.rooms){await assert.rejects(()=>api('/transaction',{code:r.code,actor:s.actor,action:'claim'}),/already|claimed|complete/i);r.duplicateRejected=true;}
  assert.deepEqual(await amounts(),before);s.duplicateDelta='0';save(s);
 }
 const rooms=await Promise.all(s.rooms.map(r=>api('/sync',{code:r.code,actor:s.actor})));
 const evidence={release:s.release,observedAt:new Date().toISOString(),paused:(await fetch('https://soldoku.com/api/competitions/config').then(r=>r.json())).paused,before:s.before,balances:await amounts(),rooms:rooms.map((r,i)=>({code:r.code,name:r.name,participants:r.participants,endsAt:r.endsAt,funded:r.funded,leaderboard:r.leaderboard,ownerDeposit:s.rooms[i].ownerDeposit,ownerRefund:s.rooms[i].ownerRefund}))};
 // Do not publish signed transaction bytes or authentication sessions.
 for(const r of evidence.rooms){if(r.funded?.settlement)delete r.funded.settlement.serialized;for(const a of r.funded?.settlementAlso??[])delete a.serialized;}
 for(const r of evidence.rooms){const id=Buffer.alloc(8);id.writeBigUInt64LE(BigInt(r.funded.id));const escrow=PublicKey.findProgramAddressSync([Buffer.from('competition'),id],new PublicKey(cfg.program))[0];const vault=getAssociatedTokenAddressSync(new PublicKey(cfg.mint),escrow,true);r.escrow=escrow.toBase58();r.vault=vault.toBase58();r.vaultAmount=(await getAccount(c,vault,'finalized')).amount.toString();if(r.funded.settlementSignature && r.funded.settlementSignature!=='chain-closed')r.settlementChainStatus=(await c.getSignatureStatuses([r.funded.settlementSignature],{searchTransactionHistory:true})).value[0];}
 for(let i=0;i<evidence.rooms.length;i++){const r=evidence.rooms[i];r.duplicateRejected=s.rooms[i].duplicateRejected??false;if(r.ownerRefund){r.ownerRefundChainStatus=(await c.getSignatureStatuses([r.ownerRefund],{searchTransactionHistory:true})).value[0];assert.equal(r.ownerRefundChainStatus?.confirmationStatus,'finalized');assert.equal(r.ownerRefundChainStatus.err,null);}}
 evidence.duplicateDelta=s.duplicateDelta??null;
 writeFileSync(`${out}/chain-state.json`,JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));
}
