import { replayFromChain } from '@mempire/sdk';
import { net } from '../chain/provider';
import { viewState } from '../sim/engine';
import type { Checkpoint, ReplayInput } from '../sim/replay';
export interface ReplayBundle extends ReplayInput {matchId:number;checkpoints:Checkpoint[];seats:[string,string];metaEpoch:number;chainWinner:number;settled:boolean;checks:{deckIds:boolean;archetypes:boolean;power:boolean;detail:string[]};blocks:[number,number];startAt:number|null;}
export async function loadReplay(matchId:number):Promise<ReplayBundle>{
 if(!Number.isSafeInteger(matchId)||matchId<1)throw new Error('Enter a valid match ID.');
 const r=await replayFromChain(net,String(matchId));const s=viewState(r.initial);
 return{matchId,seed:r.match.seed,format:r.match.format===0?'standard':'rush',decks:[s.players[0].deck,s.players[1].deck],inputs:r.inputs,house:r.house,
 expected:{winner:r.match.winner,end_tick:r.match.end_tick,final_hash:r.match.final_hash},
 checkpoints:r.match.state===3?[{tick:r.match.end_tick,seat:0,hash:BigInt(r.match.final_hash)}]:[],
 seats:[r.match.p0,r.match.p1??''],metaEpoch:Math.floor(Number(r.match.start_ms)/600000),chainWinner:r.match.winner,settled:r.match.state===3,
 checks:{deckIds:true,archetypes:true,power:true,detail:[]},blocks:[0,0],startAt:Number(r.match.start_ms)};
}
export async function pollReplay(bundle:ReplayBundle){const r=await loadReplay(bundle.matchId);return{inputs:r.inputs.slice(bundle.inputs.length),checkpoints:r.checkpoints,settled:r.settled,to:0};}
