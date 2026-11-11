import { refereeStep, hashState, type BotDifficulty } from '@mempire/sim';
import { createMatch } from './engine';
import { FORMATS, type InputEvent, type MatchCard, type SimState } from './types';
export const CHECKPOINT_EVERY=160;
export interface Checkpoint { tick:number;seat:number;hash:bigint }
export interface ReplayInput {seed:number;format:'standard'|'rush';decks:[MatchCard[],MatchCard[]];inputs:InputEvent[];house?:BotDifficulty|null;expected?:{winner:number;end_tick:number;final_hash:number};settled?:boolean;}
export interface Verification {matched:number;compared:number;divergedAt:number|null;seatsDisagreeAt:number|null;finalTick:number;winner:number;finalHash:number;matchesChain:boolean;}
const bots=new WeakMap<SimState,{house:BotDifficulty|null;pending:InputEvent[]}>();
export function inputsByTick(inputs:InputEvent[]){const m=new Map<number,InputEvent[]>();for(const ev of inputs)m.set(ev.tick,[...(m.get(ev.tick)??[]),ev]);return m;}
export function newReplaySim(r:ReplayInput){const sim=createMatch(r.seed,r.decks,FORMATS[r.format]);bots.set(sim,{house:r.house??null,pending:[]});return sim;}
export function replayStep(sim:SimState,inputs:Map<number,InputEvent[]>){const bot=bots.get(sim)??{house:null,pending:[]};refereeStep(sim,inputs.get(sim.tick)??[],bot.house,bot.pending);return hashState(sim);}
export function verifyReplay(r:ReplayInput,checkpoints:Checkpoint[]):Verification {
 const sim=newReplaySim(r);const inputs=inputsByTick(r.inputs);let matched=0,compared=0,divergedAt:number|null=null;
 while(sim.phase!=='ended'&&sim.tick<4801){replayStep(sim,inputs);for(const c of checkpoints.filter(c=>c.tick===sim.tick)){compared++;if(BigInt(hashState(sim))===c.hash)matched++;else divergedAt??=sim.tick;}}
 const finalHash=hashState(sim);const want=r.expected;
 const matchesChain=!!r.settled&&!!want&&want.final_hash===finalHash&&want.end_tick===sim.tick&&want.winner===(sim.winner===-2?2:sim.winner);
 if(r.settled&&!matchesChain)divergedAt??=sim.tick;
 return{matched,compared,divergedAt,seatsDisagreeAt:null,finalTick:sim.tick,winner:sim.winner,finalHash,matchesChain};
}
