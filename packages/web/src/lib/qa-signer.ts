// SPDX-License-Identifier: MIT
// DEV-only module. Production removes the guarded dynamic import, even when VITE_QA_SIGNER=1.
import type { InjectedWallet, WalletModuleFactory } from '@near-wallet-selector/core';
import { KeySigner, KeyPair, rpc } from '@mempire/sdk';
import { net } from './net';
import { najActionToInternal } from '@near-wallet-selector/core';
import { fromWalletActions } from './wallet-actions';
export const QA_SIGNER_MARKER='MEMPIRE_R3_QA_ONLY';
export interface PublicWrite{account:string;receiver:string;deposit:string;balanceBefore:string;actions:{type:string;method?:string;gas?:string}[];hash?:string;}
declare global{interface Window{__MEMPIRE_R3_SIGNER__?:{accountId:string;secretKey:string};__MEMPIRE_R3_AUTHORIZE__?:(e:PublicWrite)=>Promise<void>;__MEMPIRE_R3_REPORT__?:(e:PublicWrite)=>Promise<void>;}}
function enabled(){if(!import.meta.env.DEV||import.meta.env.VITE_QA_SIGNER!=='1'||!['127.0.0.1','localhost'].includes(location.hostname))throw Error('QA_SIGNER_DISABLED');}

/** Wallet-style approval sheet for the dev-only test signer. Shown only when the recorder or a tester sets window.__MEMPIRE_QA_SHEET__
 *  (headless QA runs auto-approve). Production bundles never contain this module. */
declare global{interface Window{__MEMPIRE_QA_SHEET__?:boolean;}}
const near=(y:string)=>{const n=BigInt(y),w=n/10n**24n,f=(n%10n**24n).toString().padStart(24,'0').slice(0,4).replace(/0+$/,'');return f?`${w}.${f}`:`${w}`;};
function describe(receiver:string,a:any):{title:string;lines:[string,string][]}{
 const p=a.params??{};
 if(a.type==='AddKey')return{title:'Allow this match to sign your card drops (play-only key, deleted after)',lines:[['Key can do','Call play on '+p.accessKey?.permission?.receiverId+' and nothing else'],['Gas allowance',near(String(p.accessKey?.permission?.allowance??0))+' NEAR, no transfers'],['Removed','When the match settles']]};
 if(a.type==='DeleteKey')return{title:'Delete the play-only key from your account',lines:[['Effect','The match key stops working; your own key is untouched']]};
 const m=p.methodName,args=p.args??{},dep=near(String(p.deposit??0));
 if(m==='challenge_house')return{title:`Stake ${dep} NEAR against a house`,lines:[['Method','challenge_house (house #'+args.house+')'],['Stake',dep+' NEAR, escrowed by the arena']]};
 if(m==='create_match'||m==='join_match')return{title:`Stake ${dep} NEAR on a match`,lines:[['Method',m],['Stake',dep+' NEAR, escrowed by the arena']]};
 if(m==='settle')return{title:'Settle the match: the referee replay pays the winner',lines:[['Method','settle (match #'+args.id+')'],['Deposit','0 NEAR']]};
 if(m==='cancel_match')return{title:'Cancel the match and take your stake back',lines:[['Method','cancel_match']]};
 return{title:'Call '+m,lines:[['Receiver',receiver]]};
}
async function approve(account:string,receiver:string,actions:any[]){
 if(!window.__MEMPIRE_QA_SHEET__)return;
 const a:any=('type' in actions[0]?actions[0]:najActionToInternal(actions[0])),d=describe(receiver,a),gas=a.params?.gas?`${Number(BigInt(a.params.gas)/10n**12n)} Tgas`:'default gas';
 const host=document.createElement('div');host.id='qa-sheet';
 host.setAttribute('style','position:fixed;inset:0;z-index:2147483000;background:rgba(42,29,92,.55);display:grid;place-items:center;font-family:var(--sans)');
 const row=(k:string,v:string)=>`<div style="display:flex;justify-content:space-between;gap:16px;padding:9px 0;border-top:2px solid rgba(42,29,92,.1);font-size:15px"><span style="color:#5b5385;font-weight:700">${k}</span><span style="font-weight:800;text-align:right;overflow-wrap:anywhere">${v}</span></div>`;
 const esc=(t:string)=>t.replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c] as string));
 host.innerHTML=`<div role="dialog" aria-modal="true" aria-label="Approve transaction" style="width:min(460px,92vw);background:#fff;border:4px solid #2a1d5c;border-radius:28px;box-shadow:0 10px 0 #2a1d5c;padding:22px 24px;color:#2a1d5c">
  <div style="font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#5223c9">Test wallet &middot; NEAR testnet</div>
  <h2 style="margin:6px 0 12px;font-family:var(--display);font-size:24px;line-height:1.15">${esc(d.title)}</h2>
  ${row('Signer',esc(account))}${row('Receiver',esc(receiver))}${d.lines.map(([k,v])=>row(esc(k),esc(v))).join('')}${row('Gas',gas)}
  <div style="display:flex;gap:12px;margin-top:16px"><button data-qa="reject" style="flex:1;height:50px;border-radius:16px;border:3px solid #2a1d5c;background:#fff;color:#2a1d5c;font:800 17px var(--sans);cursor:pointer">Reject</button><button data-qa="approve" style="flex:1;height:50px;border-radius:16px;border:3px solid #2a1d5c;background:#7ee84a;color:#0d4a12;font:800 17px var(--sans);box-shadow:0 4px 0 #1f9112;cursor:pointer">Approve</button></div></div>`;
 document.body.appendChild(host);
 await new Promise<void>((ok,no)=>{host.querySelector('[data-qa=approve]')!.addEventListener('click',()=>ok());host.querySelector('[data-qa=reject]')!.addEventListener('click',()=>no(Error('Transaction rejected in the test wallet')));});
 host.remove();
}
export async function authorize(e:PublicWrite){enabled();if(!window.__MEMPIRE_R3_AUTHORIZE__)throw Error('QA_BUDGET_CALLBACK_REQUIRED');await window.__MEMPIRE_R3_AUTHORIZE__(e);}
export async function report(e:PublicWrite){enabled();if(!window.__MEMPIRE_R3_REPORT__)throw Error('QA_EVIDENCE_CALLBACK_REQUIRED');await window.__MEMPIRE_R3_REPORT__(e);}
export function setupQaSigner():WalletModuleFactory<InjectedWallet>{return async({options})=>{
 enabled();if(options.network.networkId!=='testnet')throw Error('QA_TESTNET_ONLY');
 return{id:'mempire-qa-signer',type:'injected',metadata:{name:'Local QA signer',description:'Testnet automation only',iconUrl:'',downloadUrl:'',available:true,deprecated:false},async init(){
  let signer:KeySigner|undefined;
  function key(){if(signer)return signer;const c=window.__MEMPIRE_R3_SIGNER__;if(!c||!c.accountId.endsWith('.mempire-relay-41966.testnet'))throw Error('QA_REPO_PLAYER_REQUIRED');try{signer=new KeySigner(net.rpc,c.accountId,KeyPair.fromString(c.secretKey as never));}catch{throw Error('QA_INVALID_CREDENTIAL');}delete window.__MEMPIRE_R3_SIGNER__;return signer;}
  const accounts=async()=>sessionStorage.getItem('mempire:r3:connected')==='1'?[{accountId:key().accountId,publicKey:key().publicKey}]:[];
  const send:InjectedWallet['signAndSendTransaction']=async p=>{const s=key(),receiver=p.receiverId;if(receiver!==s.accountId&&receiver!==net.arena)throw Error('QA_RECEIVER_NOT_ALLOWED');const actions=fromWalletActions(p.actions);try{await approve(s.accountId,receiver,p.actions as any[]);}catch(e){document.getElementById('qa-sheet')?.remove();throw e;}
   for(const a of actions){if(receiver===s.accountId){if(a.enum!=='addKey'&&a.enum!=='deleteKey')throw Error('QA_KEY_ACTION_ONLY');if(a.enum==='addKey'){const permission=a.addKey!.accessKey.permission.functionCall;if(!permission||permission.receiverId!==net.arena||permission.methodNames.join(',')!=='play'||permission.allowance!==250000000000000000000000n)throw Error('QA_PLAY_KEY_SCOPE_REQUIRED');}}
    else if(a.enum!=='functionCall'||!['challenge_house','create_match','join_match','settle','cancel_match'].includes(a.functionCall!.methodName))throw Error('QA_ARENA_METHOD_REQUIRED');}
   const out=await s.send(receiver,actions);return await rpc(net.rpc,'tx',{tx_hash:out.hash,sender_account_id:s.accountId,wait_until:'FINAL'}) as never;
  };
  const unsupported=async()=>{throw Error('QA_ACTION_NOT_SUPPORTED');};
  return{signIn:async()=>{key();sessionStorage.setItem('mempire:r3:connected','1');return accounts();},signOut:async()=>{sessionStorage.removeItem('mempire:r3:connected');},getAccounts:accounts,signAndSendTransaction:send,signAndSendTransactions:async({transactions}:Parameters<InjectedWallet['signAndSendTransactions']>[0])=>{const outcomes=[];for(const tx of transactions)outcomes.push(await send(tx));return outcomes;},verifyOwner:unsupported,signMessage:unsupported,signNep413Message:unsupported,signTransaction:unsupported} as never;
 }};
};}
