import { create } from 'zustand';
import { reader } from '../chain/provider';
import { cancelMatch, settleMatch } from '../chain/session';
import { useChain } from './chain';
export type EscrowPhase='none'|'opening'|'waiting'|'joining'|'live'|'claiming'|'claimed'|'settled'|'refunded'|'failed';
interface Store{phase:EscrowPhase;matchId:number|null;stake:number;currency:'NEAR'|'AUSD';lastSignature:string|null;lastError:string|null;recover:(id?:number)=>Promise<'paid'|'too-early'|'nothing'|'failed'>;reset:()=>void;}
export const useEscrow=create<Store>((set,get)=>({phase:'none',matchId:null,stake:0,currency:'NEAR',lastSignature:null,lastError:null,
 reset:()=>set({phase:'none',matchId:null,stake:0,lastSignature:null,lastError:null}),
 recover:async(id)=>{const matchId=id??get().matchId;if(!matchId)return'nothing';try{const m=await reader.match(matchId);if(!m||m.state>2)return'nothing';
 if(m.state===1){await cancelMatch(String(matchId));set({phase:'refunded'});}else{if(Date.now()<Number(m.close_ms)+1500)return'too-early';await settleMatch(String(matchId),null);set({phase:'settled'});}
 await useChain.getState().refresh();return'paid';}catch(e){set({lastError:e instanceof Error?e.message:String(e)});return'failed';}}
}));
