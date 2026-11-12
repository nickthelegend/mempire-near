// SPDX-License-Identifier: MIT
import type { InjectedWallet, WalletSelector } from '@near-wallet-selector/core';
import { fnCall, parseOutcome, rpc, viewAccount, type KeySigner } from '@mempire/sdk';
import { net } from './net';
import { checkedSend, type WalletSigner } from './signing';
import { toWalletActions } from './wallet-actions';
export const qaEnabled=import.meta.env.DEV&&import.meta.env.VITE_QA_SIGNER==='1';
let pending:Promise<WalletSelector>|undefined;
async function selector(){return pending??=import('@near-wallet-selector/core').then(async core=>{
 if(import.meta.env.DEV&&import.meta.env.VITE_QA_SIGNER==='1'){const q=await import('./qa-signer');return core.setupWalletSelector({network:'testnet',modules:[q.setupQaSigner()]});}
 const meteor=await import('@near-wallet-selector/meteor-wallet');return core.setupWalletSelector({network:'testnet',modules:[meteor.setupMeteorWallet()]});
}).catch(e=>{pending=undefined;throw e;});}
async function connected(){return(await selector()).wallet<InjectedWallet>(qaEnabled?'mempire-qa-signer':'meteor-wallet');}
async function usable(account:string){if(account.endsWith('.near'))throw Error('Connect a NEAR testnet account');const a=await viewAccount(net.rpc,account);if(a.code_hash!=='11111111111111111111111111111111')throw Error('Connect a player account, not a contract account');}
export async function connectNearWallet(){const w=await connected();const a=await w.signIn({contractId:net.arena,methodNames:[]});const account=a[0]?.accountId;if(!account)throw Error('Wallet returned no account');await usable(account);return makeWalletSigner(account);}
export async function restoreNearWallet(){const s=await selector();const a=s.store.getState().accounts.find(a=>a.active)?.accountId;if(!a)return null;await usable(a);return makeWalletSigner(a);}
export async function disconnectNearWallet(){await(await connected()).signOut();}
function makeWalletSigner(accountId:string):WalletSigner{
 const raw:KeySigner['send']=async(receiverId,actions,onSigned)=>{
  const outcome=await(await connected()).signAndSendTransaction({signerId:accountId,receiverId,actions:toWalletActions(actions)});
  const hash=outcome?.transaction?.hash;if(!hash)throw Error('Wallet returned no transaction receipt. Check the wallet before retrying.');onSigned?.(hash);
  const final=await rpc<Parameters<typeof parseOutcome>[0]>(net.rpc,'tx',{tx_hash:hash,sender_account_id:accountId,wait_until:'FINAL'});return parseOutcome(final);
 };
 const send:KeySigner['send']=(receiver,actions,onSigned)=>checkedSend(accountId,receiver,actions,raw,onSigned);
 const call:KeySigner['call']=async(contract,method,args,opts={})=>{const out=await send(contract,[fnCall(method,args,opts.tgas??30,opts.deposit??0n)]);if(!out.ok)throw Error(`${method} failed: ${out.error} (tx ${out.hash})`);return out as never;};
 return{wallet:true,accountId,send,call};
}
