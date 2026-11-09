// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';
import { createMatch, hashState, stepSim, cloneState } from './engine';
import { FORMATS, type MatchCard, type InputEvent } from './types';
import { traitForMint } from './traits';

const names = ['WIF','HATS','DOGGO','PENG','MOONCAT','RKT','BTC','NEAR'];
const deck: MatchCard[] = names.map((name, fighterId) => ({ fighterId, name, archetype: fighterId % 6 as MatchCard['archetype'], trait: traitForMint(name), level: 1, metaBps: 0 }));
const make = () => createMatch(123456, [deck, deck], FORMATS.rush);

describe('lockstep simulation', () => {
  it('has identical hashes for the same seed and inputs', () => {
    const a = make(), b = make();
    for (let i = 0; i < 100; i++) { stepSim(a, []); stepSim(b, []); }
    expect(hashState(a)).toBe(hashState(b));
    expect(hashState(cloneState(a))).toBe(hashState(a));
  });
  it('drops an input for a card outside the hand', () => {
    const a = make();
    const outOfHand = a.players[0].cycle[4];
    stepSim(a, [{ tick: 0, player: 0, deckIndex: outOfHand, x: 100, y: 100 }]);
    expect(a.units).toHaveLength(0);
    expect(a.players[0].cycle[4]).toBe(outOfHand);
  });
  it('replays a log to the same winner, end tick and hash', () => {
    const inputs: InputEvent[] = [{ tick: 1, player: 0, deckIndex: 0, x: 3500, y: 8000 }];
    const run = () => { const s = make(); while (s.phase !== 'ended') stepSim(s, inputs.filter(e => e.tick === s.tick)); return s; };
    const a = run(), b = run();
    expect([a.winner, a.tick, hashState(a)]).toEqual([b.winner, b.tick, hashState(b)]);
    expect(a.tick).toBeLessThanOrEqual(600);
  });
  it('ends rush by tick 600', () => { const s = make(); while (s.phase !== 'ended') stepSim(s, []); expect(s.tick).toBe(600); });
});
