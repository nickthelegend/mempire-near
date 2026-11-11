import {readFileSync,writeFileSync} from 'node:fs';
import {ArenaReader,replayFromChain,parseOutcome,rpc,viewAccessKeys,type Network} from '@mempire/sdk';
const evidencePath=process.argv[2];
if(!evidencePath)throw new Error('Pass the sanitized browser evidence JSON path. Never pass browser storage.');
const run=JSON.parse(readFileSync(evidencePath,'utf8')) as {at:string;resumedAt?:string;players:{accountId:string;onboardHash:string}[];receipts:{hash:string;label:string;player:string;matchId?:string}[];matchUrl:string;screens:unknown[];errors:unknown[];steps:string[]};
const deployment=JSON.parse(readFileSync('deployments/testnet.json','utf8'));
const net:Network={networkId:'testnet',rpc:'https://test.rpc.fastnear.com,https://rpc.testnet.near.org',arena:deployment.arena,explorer:deployment.explorer};
const reader=new ArenaReader(net);
const id=run.matchUrl.split('/').pop()!;
const unique=new Map<string,{hash:string;label:string;player?:string;sender:string}>();
run.players.forEach(p=>unique.set(p.onboardHash,{hash:p.onboardHash,label:'Guest account funded with 0.15 testnet NEAR',sender:deployment.relayer}));
for(const t of run.receipts){const direct=/^Play |^Opened staked|^Joined older/.test(t.label);const account=run.players[t.player==='a'?0:1].accountId;unique.set(t.hash,{...t,sender:direct?account:deployment.relayer});}
const txs=[];let tokensBurnt=0n;
for(const t of unique.values()){
 const raw=await rpc<Parameters<typeof parseOutcome>[0] & {transaction_outcome:{outcome:{tokens_burnt:string}};receipts_outcome:{outcome:{tokens_burnt:string}}[]}>(net.rpc,'tx',{tx_hash:t.hash,sender_account_id:t.sender,wait_until:'FINAL'});
 const out=parseOutcome(raw);
 const burnt=BigInt(raw.transaction_outcome.outcome.tokens_burnt)+raw.receipts_outcome.reduce((sum,r)=>sum+BigInt(r.outcome.tokens_burnt),0n);tokensBurnt+=burnt;
 txs.push({...t,url:`${net.explorer}/txns/${t.hash}`,ok:out.ok,error:out.error??null,gasBurnt:out.gasBurnt.toString(),tokensBurnt:burnt.toString()});
}
const replay=await replayFromChain(net,id);
if(!replay.matchesChain)throw new Error('Browser-compatible replay does not match the referee.');
const accessKeys=[];
for(const p of run.players){const keys=await viewAccessKeys(net.rpc,p.accountId);accessKeys.push({account:p.accountId,fullAccess:keys.keys.filter(k=>k.access_key.permission==='FullAccess').length,playOnly:keys.keys.filter(k=>typeof k.access_key.permission!=='string'&&k.access_key.permission.FunctionCall.receiver_id===net.arena).length});}
const refund=await reader.match('10');
const output={network:'testnet',arena:net.arena,at:run.at,verifiedAt:new Date().toISOString(),client:'packages/app',sourceImport:'b2b1749',players:run.players,match:replay.match,storedPlays:await reader.plays(id),browserReplay:{winner:replay.result.winner,endTick:replay.result.end_tick,finalHash:replay.result.final_hash,matchesChain:replay.matchesChain},queueRecovery:{refundedMatch:refund,joinedMatch:id},accessKeysAfter:accessKeys,transactions:txs,budget:{capNear:'3',confirmedGuestFundingNear:'0.30',earlierInterruptedAttemptFundingUpperBoundNear:'0.15',recordedGasBurntYocto:tokensBurnt.toString(),notes:'No new deployment. Earlier interrupted guest attempt is conservatively allowed for; keys were never printed. Stakes come from the funded guest balances.'},screenshots:'/private/tmp/claude-501/-Volumes-Extreme-SSD-Projects-grokbot/0f121b7c-0081-4ec0-81a9-0ccb4f7f8b48/scratchpad/mempire-port/',browserErrors:run.errors};
const file=`deployments/monad-client-match-${id}-2026-11-11.json`;writeFileSync(file,JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify({file,match:id,plays:replay.inputs.length,matchesChain:replay.matchesChain,transactions:txs.length,failedTransactions:txs.filter(t=>!t.ok).length,accessKeys}));
