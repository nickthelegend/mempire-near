// SPDX-License-Identifier: MIT
// The replay the NEAR arena runs on-chain (packages/contract/src/lib.rs `settle`), in TypeScript.
// Clients use it to render a match and to predict the referee's result; the parity fixtures
// are generated with it, so the Rust port is checked against exactly this loop.
import { decideBot, type BotDifficulty } from './bot';
import { createMatch, hashState, stepSim } from './engine';
import { traitFor } from './traits';
import { FORMATS, type InputEvent, type MatchCard, type SimState } from './types';

export const HOUSE_DIFFICULTY: BotDifficulty[] = ['easy', 'normal', 'hard'];

export interface RosterFighter { fighterId: number; ticker: string; archetype: number }

/** Deck ids plus the arena's stored market bps (one per card) -> the sim's match cards. */
export function matchCards(roster: readonly RosterFighter[], ids: readonly number[], mods: readonly number[]): MatchCard[] {
  return ids.map((id, i) => {
    const f = roster[id];
    if (!f) throw new Error(`Unknown fighter ${id}`);
    return { fighterId: id, name: f.ticker, archetype: f.archetype as MatchCard['archetype'], trait: traitFor(f.ticker), level: 1, metaBps: Number(mods[i] ?? 0) };
  });
}

export function initialState(seed: number, decks: [MatchCard[], MatchCard[]], format: 0 | 1): SimState {
  return createMatch(seed >>> 0, decks, format === 0 ? FORMATS.standard : FORMATS.rush);
}

/**
 * One referee tick: the house bot (seat 1) decides on the pre-step state, then the sim steps with
 * the logged plays for this tick plus any bot plays due now. `pending` carries the bot's delayed
 * plays between ticks and is mutated.
 */
export function refereeStep(state: SimState, log: readonly InputEvent[], house: BotDifficulty | null, pending: InputEvent[]): void {
  if (state.phase === 'ended') return;
  if (house) { const ev = decideBot(state, 1, house); if (ev) pending.push(ev); }
  const now = log.filter((e) => e.tick === state.tick);
  for (let i = pending.length - 1; i >= 0; i--) {
    if (pending[i].tick === state.tick) now.push(pending[i]);
    if (pending[i].tick <= state.tick) pending.splice(i, 1);
  }
  stepSim(state, now);
}

/** Replay to the end. `winner` uses the arena's encoding: 0 or 1 a seat, 2 a draw. */
export function refereeReplay(initial: SimState, log: readonly InputEvent[], house: BotDifficulty | null) {
  const state: SimState = structuredClone(initial);
  const pending: InputEvent[] = [];
  while (state.phase !== 'ended') refereeStep(state, log, house, pending);
  return { state, winner: state.winner === -2 ? 2 : state.winner, endTick: state.tick, finalHash: hashState(state) };
}
