import { create } from 'zustand';
import { KeyPair, viewAccount } from '@mempire/sdk';
import { guestSigner, setSigner, connectMeteor, restoreMeteor, disconnectMeteor } from '../chain/account';
import { net, relayer } from '../chain/provider';
const DEVICE='mempire:monad-port:near:device';
const ACTIVE='mempire:monad-port:near:active';
export type WalletKind='guest'|'injected'|'passkey'|'privy';
interface WalletState {
 connected:boolean;connecting:string|null;error:string|null;address:string;walletName:string;walletIcon:string|null;
 kind:WalletKind|null;mon:number;isGuest:boolean;locked:boolean;sessionStartedAt:number;sessionExpiresAt:number;
 pickerOpen:boolean;wallets:{id:string;name:string;icon:string}[];privyConsent:null;
 openPicker:()=>void;closePicker:()=>void;connectGuest:(name?:string)=>Promise<void>;connect:(id:string)=>Promise<void>;
 autoConnect:()=>Promise<void>;disconnect:()=>void;setChainBalance:(n:number)=>void;spend:(n:number)=>boolean;receive:(n:number)=>void;
 lock:()=>void;revokePrivySigner:()=>Promise<void>;
}
let connecting:Promise<void>|null=null;
export const useWallet=create<WalletState>((set,get)=>({
 connected:false,connecting:null,error:null,address:'',walletName:'',walletIcon:null,kind:null,mon:0,isGuest:false,
 locked:false,sessionStartedAt:0,sessionExpiresAt:0,pickerOpen:false,wallets:[],privyConsent:null,
 openPicker:()=>set({pickerOpen:true,error:null}),closePicker:()=>{if(!get().connecting)set({pickerOpen:false});},
 connectGuest:async(name='player')=>{
  if(connecting)return connecting;
  connecting=(async()=>{set({connecting:'guest',error:null});try{
   const kp=KeyPair.fromRandom('ed25519');
   const out=await relayer.guest(name,kp.getPublicKey().toString());
   // The secret stays only in this browser; receipts and diagnostics contain hashes, never keys.
   localStorage.setItem(DEVICE,JSON.stringify({accountId:out.accountId,key:kp.toString()}));
   localStorage.setItem(ACTIVE,'guest');
   setSigner(guestSigner(out.accountId,kp.toString()));
   set({connected:true,connecting:null,pickerOpen:false,address:out.accountId,walletName:name||'Guest',kind:'guest',isGuest:true});
   if(out.hash)localStorage.setItem('mempire:near:onboard-tx',out.hash);
   const b=await viewAccount(net.rpc,out.accountId);get().setChainBalance(Number(b.amount)/1e24);
  }catch(e){set({connecting:null,error:e instanceof Error?e.message:String(e)});}})().finally(()=>{connecting=null;});
  return connecting;
 },
 connect:async()=>{if(get().connecting)return;set({connecting:'Meteor Wallet',error:null});try{
  const s=await connectMeteor();setSigner(s);localStorage.setItem(ACTIVE,'meteor');
  set({connected:true,connecting:null,pickerOpen:false,address:s.accountId,walletName:'Meteor Wallet',kind:'injected',isGuest:false});
 }catch(e){set({connecting:null,error:e instanceof Error?e.message:String(e)});}},
 autoConnect:async()=>{if(get().connected)return;try{
  if(localStorage.getItem(ACTIVE)==='guest'){
   const raw=localStorage.getItem(DEVICE);if(!raw)return;
   const d=JSON.parse(raw) as {accountId:string;key:string};if(!d.accountId.endsWith('.testnet'))return;
   setSigner(guestSigner(d.accountId,d.key));set({connected:true,address:d.accountId,walletName:'Guest',kind:'guest',isGuest:true});
  }else if(localStorage.getItem(ACTIVE)==='meteor'){
   const s=await restoreMeteor();if(s){setSigner(s);set({connected:true,address:s.accountId,walletName:'Meteor Wallet',kind:'injected',isGuest:false});}
  }
 }catch{set({error:'Could not restore this browser account. Sign in again.'});}},
 disconnect:()=>{if(get().kind==='injected')void disconnectMeteor().catch(()=>{});setSigner(null);localStorage.removeItem(ACTIVE);
 set({connected:false,address:'',walletName:'',kind:null,mon:0,isGuest:false,pickerOpen:false});},
 setChainBalance:mon=>set({mon}),spend:n=>get().mon>=n,receive:()=>{},lock:()=>{},revokePrivySigner:async()=>{},
}));
export { activeSigner as signer } from '../chain/account';
