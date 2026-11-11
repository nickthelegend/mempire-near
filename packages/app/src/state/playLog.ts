import { create } from 'zustand';
import type { RunnerEvent } from '@mempire/sdk';
export type LogPhase='off'|'live'|'done';
export interface PlayRecord{id:number;tick:number;deckIndex:number;state:'sent'|'executed'|'final'|'failed';hash?:string;pool?:string;executedMs?:number;finalMs?:number;}
interface Store{phase:LogPhase;matchId:number|null;sent:number;confirmed:number;playsLost:number;marksLost:number;lastHash:string|null;lastLatencyMs:number|null;avgLatencyMs:number|null;lastFinalMs:number|null;avgFinalMs:number|null;plays:PlayRecord[];reset:()=>void;}
const initial={phase:'off' as LogPhase,matchId:null,sent:0,confirmed:0,playsLost:0,marksLost:0,lastHash:null,lastLatencyMs:null,avgLatencyMs:null,lastFinalMs:null,avgFinalMs:null,plays:[]};
export const usePlayLog=create<Store>(set=>({...initial,reset:()=>set(initial)}));
export function noteRunnerEvent(e:RunnerEvent){const s=usePlayLog.getState();
 if(e.type==='playSent')usePlayLog.setState({sent:s.sent+1,lastHash:e.hash,plays:[...s.plays,{id:s.sent+1,tick:e.tick,deckIndex:e.deckIndex,state:'sent' as const,hash:e.hash}].slice(-40)});
 if(e.type==='playLanded')usePlayLog.setState({confirmed:s.confirmed+1,lastLatencyMs:e.ms,lastHash:e.hash,plays:s.plays.map(p=>p.hash===e.hash?{...p,state:'executed',executedMs:e.ms}:p)});
 if(e.type==='playRefused')usePlayLog.setState({playsLost:s.playsLost+1,plays:s.plays.map(p=>p.hash===e.hash?{...p,state:'failed'}:p)});
}
