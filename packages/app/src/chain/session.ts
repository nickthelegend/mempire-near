import { KeyPair, KeySigner, addSessionKey, arenaCalls, deleteKey, parseNear, viewAccessKeys, type Claim } from '@mempire/sdk';
import { net, reader, relayer } from './provider';
import { activeSigner, type Signer } from './account';
export const STAKE_MON_NEEDED=0.01;
const storageKey=(id:string)=>`mempire:monad-port:near:session:${id}`;
export interface Step {label:string;hash?:string;matchId?:string;}
export const recordStep=(step:Step)=>{const old=JSON.parse(localStorage.getItem('mempire:near:receipts')||'[]') as Step[];localStorage.setItem('mempire:near:receipts',JSON.stringify([...old,step].slice(-100)));};
async function sendSponsored(s:Signer,receiver:string,actions:Parameters<KeySigner['send']>[1],label:string){
 const out=s.keySigner?await relayer.relay(await s.keySigner.signDelegate(receiver,actions)):await s.send(receiver,actions);
 recordStep({label,hash:out.hash});if(!out.ok)throw new Error(`${label}: ${out.error} (tx ${out.hash})`);return out;
}
async function newSession(s:Signer){const kp=KeyPair.fromRandom('ed25519');await sendSponsored(s,s.accountId,[addSessionKey(kp.getPublicKey().toString(),net.arena,['play'],parseNear('0.05'))],'Added play-only session key (0.05 NEAR allowance)');return kp;}
export const sessionFor=(id:string|number)=>{const secret=localStorage.getItem(storageKey(String(id)));const s=activeSigner();return secret&&s?new KeySigner(net.rpc,s.accountId,KeyPair.fromString(secret as never)):null;};
export async function openOrJoin(tier:number,format:0|1,deck:number[]):Promise<{id:string;active:boolean}>{
 const s=activeSigner();if(!s)throw new Error('Sign in first.');
 const c=await reader.config();const stake=c.tier_stakes[tier];if(!stake)throw new Error('Unsupported stake tier.');
 const open=await reader.openMatches();const pending=open[tier*2+format];let join:string|null=null;
 if(pending&&pending!=='0'){const m=await reader.match(pending);if(m?.state===1){if(m.p0===s.accountId)throw new Error(`Match #${pending} already holds your stake. Cancel it in Empire before opening another.`);join=pending;}}
 const kp=await newSession(s);let id=join??'';
 try{const out=join?await s.send(net.arena,[arenaCalls.joinMatch(join,deck,kp.getPublicKey().toString(),stake)]):await s.send(net.arena,[arenaCalls.createMatch(tier,format,deck,kp.getPublicKey().toString(),stake)]);
 recordStep({label:join?'Joined staked match':'Opened staked match',hash:out.hash});if(!out.ok)throw new Error(out.error);id=join??String(out.value);
 if(!/^\d+$/.test(id))throw new Error('The stake was sent but no match ID was returned. Check NearBlocks before retrying.');
 localStorage.setItem(storageKey(id),kp.toString());localStorage.setItem('mempire:near:waiting',id);
 }catch(e){await sendSponsored(s,s.accountId,[deleteKey(kp.getPublicKey().toString())],'Removed unused session key').catch(()=>{});throw e;}
 return{id,active:(await reader.match(id))?.state===2};
}
export async function settleMatch(id:string,claim:Claim|null){const s=activeSigner();if(!s)throw new Error('Sign in to ask the referee to settle.');
 for(let i=0;i<20;i++){const m=await reader.match(id);if(m?.state===3)return m;if(!m||m.state!==2)throw new Error('This match is not active.');
 const out=await sendSponsored(s,net.arena,[arenaCalls.settle(id,claim)],`Referee settlement #${id}`);
 if((out.value as {status?:string})?.status==='settled')break;}
 const m=await reader.match(id);if(m?.state!==3)throw new Error('Replay is still in progress. Retry settlement.');
 await removeSession(id);return m;
}
export async function removeSession(id:string){const s=activeSigner();const key=sessionFor(id);if(!s||!key)return;
 const keys=await viewAccessKeys(net.rpc,s.accountId);if(keys.keys.some(k=>k.public_key===key.publicKey))await sendSponsored(s,s.accountId,[deleteKey(key.publicKey)],`Deleted session key #${id}`);
 localStorage.removeItem(storageKey(id));if(localStorage.getItem('mempire:near:waiting')===id)localStorage.removeItem('mempire:near:waiting');
}
export async function cancelMatch(id:string){const s=activeSigner();if(!s)throw new Error('Sign in first.');await sendSponsored(s,net.arena,[arenaCalls.cancel(id)],`Cancelled match #${id}`);await removeSession(id);}
