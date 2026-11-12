// SPDX-License-Identifier: MIT
import { internalActionToNaj, najActionToInternal, type InternalAction, type Action } from '@near-wallet-selector/core';
import { addSessionKey, deleteKey, fnCall, type KeySigner } from '@mempire/sdk';
type SdkAction=Parameters<KeySigner['send']>[1][number];
export function toWalletActions(actions:SdkAction[]):Action[]{return actions.map(a=>{
 let out:InternalAction;
 if(a.enum==='functionCall'){const f=a.functionCall!;out={type:'FunctionCall',params:{methodName:f.methodName,args:JSON.parse(new TextDecoder().decode(f.args)),gas:f.gas.toString(),deposit:f.deposit.toString()}};}
 else if(a.enum==='addKey'){const f=a.addKey!.accessKey.permission.functionCall;if(!f)throw Error('Only function-call keys may be added');out={type:'AddKey',params:{publicKey:a.addKey!.publicKey.toString(),accessKey:{nonce:0,permission:{receiverId:f.receiverId,methodNames:f.methodNames,allowance:f.allowance?.toString()}}}};}
 else if(a.enum==='deleteKey')out={type:'DeleteKey',params:{publicKey:a.deleteKey!.publicKey.toString()}};
 else throw Error('Unsupported game wallet action');
 return internalActionToNaj(out);
});}
export function fromWalletActions(actions:Action[]):SdkAction[]{return actions.map(a=>{
 const x=('type' in a?a:najActionToInternal(a)) as InternalAction;
 if(x.type==='FunctionCall')return fnCall(x.params.methodName,x.params.args,Number(BigInt(x.params.gas)/10n**12n),x.params.deposit);
 if(x.type==='AddKey'){const p=x.params.accessKey.permission;if(p==='FullAccess')throw Error('Full-access keys are not allowed');return addSessionKey(x.params.publicKey,p.receiverId,p.methodNames??[],BigInt(p.allowance??'0'));}
 if(x.type==='DeleteKey')return deleteKey(x.params.publicKey);
 throw Error('Unsupported game wallet action');
});}
