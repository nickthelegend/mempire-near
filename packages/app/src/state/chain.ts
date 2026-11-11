import { create } from 'zustand';
import { fetchCardsFor,fetchConfig,fetchRegisteredCoins,fetchMonBalance,fetchMarketMeta,type ChainCard,type ChainChest,type ChainConfig,type ChainCoin } from '../chain/read';
import { canSign } from '../chain/account';
import { explorerUrl } from '../chain/provider';
import { useWallet } from './wallet';
export type ChainMode='offline'|'simulated'|'onchain';
interface ChainState {mode:ChainMode;cluster:string;loading:boolean;error:string|null;config:ChainConfig|null;coins:ChainCoin[];cards:ChainCard[];chests:ChainChest[];balances:Map<string,number>;solBalance:number;ausdBalance:number;mempireBalance:number;metaEpoch:number;marketVersion:number;owner:string|null;lastSignature:string|null;
 init:()=>Promise<void>;loadWallet:(owner:string)=>Promise<void>;refresh:()=>Promise<void>;refreshSettled:()=>Promise<void>;clearWallet:()=>void;noteSignature:(s:string)=>void;explorer:typeof explorerUrl;cardById:(id:number)=>ChainCard|undefined;}
let inFlight:Promise<void>|null=null;
export const useChain=create<ChainState>((set,get)=>({mode:'offline',cluster:'near-testnet',loading:false,error:null,config:null,coins:[],cards:[],chests:[],balances:new Map(),solBalance:0,ausdBalance:0,mempireBalance:0,metaEpoch:0,marketVersion:0,owner:null,lastSignature:null,
 init:async()=>{if(inFlight)return inFlight;inFlight=(async()=>{set({loading:true});try{const [config,coins]=await Promise.all([fetchConfig(),fetchRegisteredCoins()]);set({config,coins,loading:false,error:null,mode:canSign()?'onchain':'simulated'});try{const p=await fetchMarketMeta();set(s=>({metaEpoch:p.epoch,marketVersion:s.marketVersion+1}));}catch{/* price read failures leave explicit neutral/unread states */}}catch(e){set({loading:false,error:e instanceof Error?e.message:String(e),mode:'offline'});}})().finally(()=>{inFlight=null;});return inFlight;},
 loadWallet:async(owner)=>{set({owner,loading:true});try{await get().init();const [cards,b]=await Promise.all([fetchCardsFor(owner),fetchMonBalance(owner)]);if(get().owner!==owner)return;useWallet.getState().setChainBalance(b);set({cards,solBalance:b,loading:false,mode:get().config&&canSign()?'onchain':'offline'});}catch(e){set({loading:false,error:String(e)});}},
 refresh:async()=>{const owner=get().owner;if(owner)await get().loadWallet(owner);else await get().init();},
 refreshSettled:async()=>get().refresh(),
 clearWallet:()=>set({owner:null,cards:[],solBalance:0,mode:get().config?'simulated':'offline'}),
 noteSignature:lastSignature=>set({lastSignature}),explorer:explorerUrl,cardById:id=>get().cards.find(c=>c.id===id),
}));
export const isOnchain=(s:ChainState)=>s.mode==='onchain';
