import { createMatch as createNearMatch, cloneState as cloneNearState, type SimState as NearState } from '@mempire/sim';
import { COINS } from '../lib/coins';
import type { MatchCard, SimState, Format } from './types';
export * from '@mempire/sim';
export function viewState(state:NearState):SimState {
 const decks=state.players.map(p=>({...p,deck:p.deck.map(c=>({...c,coinId:COINS[c.fighterId].mint}))})) as SimState['players'];
 return {...state,players:decks};
}
export function createMatch(seed:number,decks:[MatchCard[],MatchCard[]],format?:Format):SimState {return viewState(createNearMatch(seed,decks,format));}
export function cloneState(state:SimState):SimState{return viewState(cloneNearState(state));}
