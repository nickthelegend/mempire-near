import { create } from 'zustand';
import { latestBlock } from '@mempire/sdk';
import { net } from '../chain/provider';
export type CommitState='Optimistic'|'Finalized';
export interface BlockChip{blockId:string;number:number;hash:string;state:CommitState;intervalMs:number|null;finalizedMs:number|null;}
interface Store{chips:BlockChip[];history:BlockChip[];status:'connecting'|'live'|'unavailable';lagMs:number|null;intervalMs:number|null;retain:()=>()=>void;}
let users=0,timer:ReturnType<typeof setInterval>|null=null,inFlight=false;
let prior:{height:number;ts:number}|null=null;
async function poll(){if(inFlight)return;inFlight=true;try{const [head,final]=await Promise.all([latestBlock(net.rpc,'optimistic'),latestBlock(net.rpc,'final')]);
 const ts=Number(BigInt(head.timestamp_nanosec)/1000000n),fin=Number(BigInt(final.timestamp_nanosec)/1000000n);
 const interval=prior&&head.height>prior.height?Math.round((ts-prior.ts)/(head.height-prior.height)):useMonadHeads.getState().intervalMs;prior={height:head.height,ts};
 const chip:BlockChip={blockId:head.hash,number:head.height,hash:head.hash,state:head.height<=final.height?'Finalized':'Optimistic',intervalMs:interval,finalizedMs:null};
 useMonadHeads.setState(s=>{const old=s.chips.map(c=>({...c,state:c.number<=final.height?'Finalized' as const:c.state}));const chips=old.some(c=>c.hash===chip.hash)?old:[chip,...old].slice(0,7);return{chips,history:chips,status:'live',lagMs:Math.max(0,ts-fin),intervalMs:interval};});
 }catch{useMonadHeads.setState({status:'unavailable'});}finally{inFlight=false;}}
export const useMonadHeads=create<Store>(()=>({chips:[],history:[],status:'connecting',lagMs:null,intervalMs:null,retain:()=>{users++;if(!timer){void poll();timer=setInterval(()=>void poll(),2000);}return()=>{users--;if(users===0&&timer){clearInterval(timer);timer=null;}};}}));
