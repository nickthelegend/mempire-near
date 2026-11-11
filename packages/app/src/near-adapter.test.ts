import {describe,it,expect} from 'vitest';
import {roster} from '@mempire/sdk';
import {matchCards,hashState,HOUSE_DIFFICULTY,type InputEvent} from '@mempire/sim';
import fixtures from '../../contract/tests/fixtures/parity.json';
import {COINS,coinByMint} from './lib/coins';
import {createMatch} from './sim/engine';
import {FORMATS} from './sim/types';
import {verifyReplay,type ReplayInput} from './sim/replay';
import {archetypeForMint} from './sim/archetypes';
import {traitForMint} from './sim/traits';
const sample=(house:boolean)=>fixtures.fixtures.find(f=>(f.house!==null)===house)!;
function replay(f:ReturnType<typeof sample>):ReplayInput{
 const decks=[matchCards(roster.fighters,f.deck0,f.mods.slice(0,8)),matchCards(roster.fighters,f.deck1,f.mods.slice(8))]
  .map(deck=>deck.map(c=>({...c,coinId:COINS[c.fighterId].mint}))) as ReplayInput['decks'];
 return {seed:f.seed,format:f.format===0?'standard':'rush',decks,
  inputs:f.plays.map(([tick,player,deckIndex,x,y])=>({tick,player,deckIndex,x,y})) as InputEvent[],
  house:f.house===null?null:HOUSE_DIFFICULTY[f.house],settled:true,
  expected:{winner:f.winner===-2?2:f.winner,end_tick:f.endTick,final_hash:f.finalHash}};
}
describe('Imported renderer → NEAR referee compatibility',()=>{
 it('uses only the deployed fighter IDs, archetypes and ticker-derived traits',()=>{
  expect(COINS).toHaveLength(roster.fighters.length);
  for(const f of roster.fighters){const c=COINS[f.fighterId];expect(coinByMint(c.mint)).toBe(c);expect(archetypeForMint(c.mint)).toBe(f.archetype);
   const card=matchCards(roster.fighters,[f.fighterId],[0])[0];expect(traitForMint(c.mint)).toBe(card.trait);}
 });
 it('keeps the Rust parity fixture initial hash after adding renderer identity',()=>{const f=sample(false),r=replay(f);expect(hashState(createMatch(r.seed,r.decks,FORMATS[r.format]))).toBe(f.initialHash);});
 it.each([false,true])('replays the existing Rust golden fixture (house=%s), including its final result',house=>{
  const f=sample(house),r=replay(f);const v=verifyReplay(r,[{tick:f.endTick,seat:0,hash:BigInt(f.finalHash)}]);
  expect(v.matchesChain).toBe(true);expect(v.finalHash).toBe(f.finalHash);expect(v.finalTick).toBe(f.endTick);expect(v.divergedAt).toBeNull();
 });
 it('rejects a forged final hash',()=>{const r=replay(sample(false));r.expected!.final_hash^=1;expect(verifyReplay(r,[]).matchesChain).toBe(false);});
 it('rejects a forged winner even if the final hash agrees',()=>{const r=replay(sample(false));r.expected!.winner=r.expected!.winner===0?1:0;expect(verifyReplay(r,[]).matchesChain).toBe(false);});
 it('rejects a forged end tick',()=>{const r=replay(sample(false));r.expected!.end_tick++;expect(verifyReplay(r,[]).matchesChain).toBe(false);});
 it('never calls an unsettled match verified',()=>{const r=replay(sample(false));r.settled=false;expect(verifyReplay(r,[]).matchesChain).toBe(false);});
});
