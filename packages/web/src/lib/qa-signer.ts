// SPDX-License-Identifier: MIT
// DEV-only module. Production removes the guarded dynamic import, even when VITE_QA_SIGNER=1.
import type { InjectedWallet, WalletModuleFactory } from '@near-wallet-selector/core';
import { KeySigner, KeyPair, rpc } from '@mempire/sdk';
import { net } from './net';
import { fromWalletActions } from './wallet-actions';
export const QA_SIGNER_MARKER='MEMPIRE_R3_QA_ONLY';
export interface PublicWrite{account:string;receiver:string;deposit:string;balanceBefore:string;actions:{type:string;method?:string;gas?:string}[];hash?:string;}
declare global{interface Window{__MEMPIRE_R3_SIGNER__?:{accountId:string;secretKey:string};__MEMPIRE_R3_AUTHORIZE__?:(e:PublicWrite)=>Promise<void>;__MEMPIRE_R3_REPORT__?:(e:PublicWrite)=>Promise<void>;}}
function enabled(){if(!import.meta.env.DEV||import.meta.env.VITE_QA_SIGNER!=='1'||!['127.0.0.1','localhost'].includes(location.hostname))throw Error('QA_SIGNER_DISABLED');}
export async function authorize(e:PublicWrite){enabled();if(!window.__MEMPIRE_R3_AUTHORIZE__)throw Error('QA_BUDGET_CALLBACK_REQUIRED');await window.__MEMPIRE_R3_AUTHORIZE__(e);}
export async function report(e:PublicWrite){enabled();if(!window.__MEMPIRE_R3_REPORT__)throw Error('QA_EVIDENCE_CALLBACK_REQUIRED');await window.__MEMPIRE_R3_REPORT__(e);}
export function setupQaSigner():WalletModuleFactory<InjectedWallet>{return async({options})=>{
 enabled();if(options.network.networkId!=='testnet')throw Error('QA_TESTNET_ONLY');
 return{id:'mempire-qa-signer',type:'injected',metadata:{name:'Local QA signer',description:'Testnet automation only',iconUrl:'',downloadUrl:'',available:true,deprecated:false},async init(){
  let signer:KeySigner|undefined;
  function key(){if(signer)return signer;const c=window.__MEMPIRE_R3_SIGNER__;if(!c||!c.accountId.endsWith('.mempire-relay-41966.testnet'))throw Error('QA_REPO_PLAYER_REQUIRED');try{signer=new KeySigner(net.rpc,c.accountId,KeyPair.fromString(c.secretKey as never));}catch{throw Error('QA_INVALID_CREDENTIAL');}delete window.__MEMPIRE_R3_SIGNER__;return signer;}
  const accounts=async()=>sessionStorage.getItem('mempire:r3:connected')==='1'?[{accountId:key().accountId,publicKey:key().publicKey}]:[];
  const send:InjectedWallet['signAndSendTransaction']=async p=>{const s=key(),receiver=p.receiverId;if(receiver!==s.accountId&&receiver!==net.arena)throw Error('QA_RECEIVER_NOT_ALLOWED');const actions=fromWalletActions(p.actions);
   for(const a of actions){if(receiver===s.accountId){if(a.enum!=='addKey'&&a.enum!=='deleteKey')throw Error('QA_KEY_ACTION_ONLY');if(a.enum==='addKey'){const permission=a.addKey!.accessKey.permission.functionCall;if(!permission||permission.receiverId!==net.arena||permission.methodNames.join(',')!=='play'||permission.allowance!==250000000000000000000000n)throw Error('QA_PLAY_KEY_SCOPE_REQUIRED');}}
    else if(a.enum!=='functionCall'||!['challenge_house','create_match','join_match','settle','cancel_match'].includes(a.functionCall!.methodName))throw Error('QA_ARENA_METHOD_REQUIRED');}
   const out=await s.send(receiver,actions);return await rpc(net.rpc,'tx',{tx_hash:out.hash,sender_account_id:s.accountId,wait_until:'FINAL'}) as never;
  };
  const unsupported=async()=>{throw Error('QA_ACTION_NOT_SUPPORTED');};
  return{signIn:async()=>{key();sessionStorage.setItem('mempire:r3:connected','1');return accounts();},signOut:async()=>{sessionStorage.removeItem('mempire:r3:connected');},getAccounts:accounts,signAndSendTransaction:send,signAndSendTransactions:async({transactions}:Parameters<InjectedWallet['signAndSendTransactions']>[0])=>{const outcomes=[];for(const tx of transactions)outcomes.push(await send(tx));return outcomes;},verifyOwner:unsupported,signMessage:unsupported,signNep413Message:unsupported,signTransaction:unsupported} as never;
 }};
};}
