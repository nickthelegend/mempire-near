// SPDX-License-Identifier: MIT
// Public QA evidence only. Never pass browser storage or credentials here.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { ArenaReader, replayFromChain, parseOutcome, rpc, viewAccessKeys, type Network } from '@mempire/sdk';
const input=process.argv[2];
if(!input) throw new Error('Pass the sanitized v5 browser result JSON.');
const run=JSON.parse(readFileSync(input,'utf8'));
const deployment=JSON.parse(readFileSync('deployments/testnet.json','utf8'));
const net:Network={networkId:'testnet',rpc:'https://test.rpc.fastnear.com,https://rpc.testnet.near.org',arena:deployment.arena,explorer:deployment.explorer};
const known=new Set<string>();
for(const file of readdirSync('deployments').filter(f=>/^monad-client-match-.*\.json$/.test(f))){for(const tx of JSON.parse(readFileSync(`deployments/${file}`,'utf8')).transactions??[])known.add(tx.hash);}
const priorMatchIds=new Map<string,string>();
for(const file of readdirSync('deployments').filter(f=>/^reposition-match-.*\.json$/.test(f))){for(const tx of JSON.parse(readFileSync(`deployments/${file}`,'utf8')).transactions??[])if(tx.matchId)priorMatchIds.set(tx.hash,tx.matchId);}
const id=run.matchUrl.split('/').pop();
const receipts=new Map<string,{hash:string;label:string;sender:string;matchId?:string}>();
for(const p of run.players)if(p.onboardHash&&!known.has(p.onboardHash))receipts.set(p.onboardHash,{hash:p.onboardHash,label:'Guest funding',sender:deployment.relayer});
for(const t of run.receipts){if(!t.hash||known.has(t.hash))continue;const direct=/^Play |^Opened staked|^Joined (older|staked)/.test(t.label);receipts.set(t.hash,{...t,sender:direct?run.players[t.player==='a'?0:1].accountId:deployment.relayer});}
const meta=JSON.parse(readFileSync('deployments/market-meta-2026-11-11.json','utf8'));
for(const tx of meta.transactions)receipts.set(tx.hash,{hash:tx.hash,label:'Signed market snapshot',sender:tx.sender});
let gas=0n,attached=0n;
const transactions=[];
for(const tx of receipts.values()){
 const raw=await rpc<any>(net.rpc,'tx',{tx_hash:tx.hash,sender_account_id:tx.sender,wait_until:'FINAL'});
 const out=parseOutcome(raw);
 const burnt=BigInt(raw.transaction_outcome.outcome.tokens_burnt)+raw.receipts_outcome.reduce((sum:bigint,r:any)=>sum+BigInt(r.outcome.tokens_burnt),0n);gas+=burnt;
 const deposits=(raw.transaction.actions as any[]).reduce((sum,a)=>sum+BigInt(a.Transfer?.deposit??a.FunctionCall?.deposit??'0'),0n);attached+=deposits;
 transactions.push({...tx,matchId:tx.label==='Guest funding'||tx.label==='Signed market snapshot'?undefined:/^Added play-only/.test(tx.label)?priorMatchIds.get(tx.hash):(/^Opened staked/.test(tx.label)?String(out.value):undefined)??tx.matchId??tx.label.match(/#(\d+)/)?.[1]??priorMatchIds.get(tx.hash)??id,ok:out.ok,error:out.error??null,url:`${net.explorer}/txns/${tx.hash}`,tokensBurnt:burnt.toString(),attachedYocto:deposits.toString()});
}
const replay=await replayFromChain(net,id);
if(!replay.matchesChain)throw new Error('Replay disagrees with referee.');
const accessKeysAfter=[];
for(const p of run.players){const result=await viewAccessKeys(net.rpc,p.accountId);accessKeysAfter.push({account:p.accountId,fullAccess:result.keys.filter(k=>k.access_key.permission==='FullAccess').length,playOnly:result.keys.filter(k=>typeof k.access_key.permission!=='string'&&k.access_key.permission.FunctionCall.receiver_id===net.arena).length});}
const retryReserve=20000000000000000000000n; // Conservative allowance for delayed RPC setup attempts without a captured receipt.
const total=gas+attached+retryReserve;
if(total>500000000000000000000000n)throw new Error('0.5 testnet NEAR task budget exceeded.');
const output={network:'testnet',arena:net.arena,at:run.at,verifiedAt:new Date().toISOString(),client:'packages/app',players:run.players,match:replay.match,storedPlays:await new ArenaReader(net).plays(id),browserReplay:{winner:replay.result.winner,endTick:replay.result.end_tick,finalHash:replay.result.final_hash,matchesChain:replay.matchesChain},accessKeysAfter,transactions,budget:{capNear:'0.5',gasBurntYocto:gas.toString(),unrecordedRetryGasReserveYocto:retryReserve.toString(),attachedYocto:attached.toString(),conservativeTotalYocto:total.toString(),note:'Counts new guest funding, stake attachments again and all recorded gas, including the market snapshots. Existing opponent funding predates this task; also reserves 0.02 NEAR for delayed setup attempts. No redeployment.'},browserErrors:run.errors,screenshots:'/private/tmp/claude-501/-Volumes-Extreme-SSD-Projects-grokbot/0f121b7c-0081-4ec0-81a9-0ccb4f7f8b48/scratchpad/mempire-v5/'};
const file=`deployments/reposition-match-${id}-2026-11-11.json`;
writeFileSync(file,JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify({file,match:id,plays:replay.inputs.length,matchesChain:replay.matchesChain,transactions:transactions.length,failures:transactions.filter(t=>!t.ok).length,conservativeNear:Number(total)/1e24,accessKeysAfter}));
