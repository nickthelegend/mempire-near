// SPDX-License-Identifier: MIT
import { KeySigner, viewAccount, type TxOutcome } from '@mempire/sdk';
import { net } from './net';
export interface WalletSigner{wallet:true;accountId:string;send:KeySigner['send'];call:KeySigner['call'];}
export type PlayerSigner=KeySigner|WalletSigner;
export const isWalletSigner=(s:PlayerSigner):s is WalletSigner=>'wallet' in s;
export async function checkedSend(account:string,receiver:string,actions:Parameters<KeySigner['send']>[1],send:KeySigner['send'],onSigned?: (hash:string)=>void):Promise<TxOutcome>{
 const deposit=actions.reduce((n,a)=>n+(a.enum==='functionCall'?a.functionCall!.deposit:0n),0n);
 const before=await viewAccount(net.rpc,account);
 if(before.code_hash!=='11111111111111111111111111111111')throw Error('Game keys cannot be managed on a contract account');
 if(BigInt(before.amount)<deposit+10n**21n)throw Error('Not enough testnet NEAR for the transaction and gas');
 const event={account,receiver,deposit:deposit.toString(),balanceBefore:before.amount,actions:actions.map(a=>({type:a.enum,method:a.enum==='functionCall'?a.functionCall!.methodName:undefined,gas:a.enum==='functionCall'?a.functionCall!.gas.toString():undefined}))};
 if(import.meta.env.DEV&&import.meta.env.VITE_QA_SIGNER==='1')await(await import('./qa-signer')).authorize(event);
 const out=await send(receiver,actions,hash=>{onSigned?.(hash);if(import.meta.env.DEV&&import.meta.env.VITE_QA_SIGNER==='1')void import('./qa-signer').then(q=>q.report({...event,hash}));});
 return out;
}
export class PlaySessionSigner extends KeySigner{
 override send(receiver:string,actions:Parameters<KeySigner['send']>[1],onSigned?: (hash:string)=>void){
  return checkedSend(this.accountId,receiver,actions,super.send.bind(this),onSigned);
 }
}
