// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';
import { roster } from '@mempire/sdk';
import { ART, badgeArt, houseArt } from './art';
import { artOf, rarityOf } from './fighters';
import { validateDeck, defaultDeck } from '../state/deck';
import { dropDecision } from '../battle/BattleBoard';

describe('v3 art map', () => {
  it('names every fighter, house, badge and prop file under /art/v3 with the mp3- prefix', () => {
    for (const f of roster.fighters) expect(artOf(f.fighterId)).toBe(`/art/v3/mp3-${f.art}.webp`);
    expect(houseArt('Kumo')).toBe('/art/v3/mp3-house-kumo.webp');
    expect(houseArt(' RYU ')).toBe('/art/v3/mp3-house-ryu.webp');
    expect(houseArt('Unknown')).toBeNull();
    expect(badgeArt('emperor')).toBe('/art/v3/mp3-badge-emperor.webp');
    for (const src of Object.values(ART)) expect(src).toMatch(/^\/art\/v3\/mp3-[a-z-]+\.webp$/);
  });
});

describe('card frames', () => {
  it('frames house fighters common, market fighters rare, and a buffed market fighter epic', () => {
    const house = roster.fighters.find((f) => f.kind === 'house')!.fighterId;
    const market = roster.fighters.find((f) => f.kind === 'market')!.fighterId;
    expect(rarityOf(house, 900)).toBe('common');
    expect(rarityOf(market, null)).toBe('rare');
    expect(rarityOf(market, -200)).toBe('rare');
    expect(rarityOf(market, 200)).toBe('epic');
  });
});

describe('deck rules', () => {
  it('accepts the default deck and refuses short or repeated decks', () => {
    expect(validateDeck(defaultDeck)).toBeNull();
    expect(validateDeck(defaultDeck.slice(0, 7))).toMatch(/eight/);
    expect(validateDeck([0, 0, 1, 2, 3, 4, 5, 6])).toMatch(/eight/);
  });
});

describe('troop drops', () => {
  it('keeps a drop in your half, snaps one just past the river, and refuses one deep in enemy ground', () => {
    expect(dropDecision(0, 9, 5)).toEqual({ x: 9, y: 5 });
    expect(dropDecision(0, 9, 15)).toEqual({ x: 9, y: 14.5 });
    expect(dropDecision(0, 9, 25)).toBeNull();
    expect(dropDecision(1, 9, 25)).toEqual({ x: 9, y: 25 });
  });
});

import type { MatchView } from '@mempire/sdk';
import { ladder, mascotOf, winRate } from '../state/history';
import { statsOf } from './fighters';
import { receiptTxs } from './receipts';
import { crownsTaken } from './match';
import { createMatch, FORMATS, traitFor, type MatchCard } from '@mempire/sim';

const match = (o: Partial<MatchView>): MatchView => ({
  id: '1', p0: 'a.testnet', p1: 'b.testnet', house: null, stake: '10', tier: 0, format: 1, state: 3, winner: 0, deck0: [6], deck1: [7], mods: [], status: [],
  seed: 1, created_ms: '0', start_ms: '0', close_ms: '0', plays0: 0, plays1: 0, session0: null, session1: null, end_tick: 600, final_hash: 1,
  paid: '18', to_season: '1', to_treasury: '1', season: 0, referee_calls: 1, settled_ms: '1000', checkpoint_tick: null, ...o,
});

describe('all-time ladder from settled matches', () => {
  it('counts wins, losses, draws and NEAR won; skips unsettled matches and house accounts', () => {
    const rows = ladder([
      match({ id: '1', winner: 0 }),
      match({ id: '2', winner: 1, p0: 'b.testnet', p1: 'a.testnet' }),
      match({ id: '3', winner: 2 }),
      match({ id: '4', state: 2 }),
      match({ id: '5', winner: 1, p0: 'b.testnet', p1: 'kumo.mempire-arena-41966.testnet', house: 0 }),
    ]);
    expect(rows.map((r) => r.account)).toEqual(['a.testnet', 'b.testnet']);
    const a = rows[0];
    expect([a.wins, a.losses, a.draws, a.played]).toEqual([2, 0, 1, 3]);
    expect(a.won).toBe(18n + 18n + 9n);
    expect(rows[1]).toMatchObject({ wins: 0, losses: 3, draws: 1 });
    expect(winRate(a)).toBe(67);
    expect(winRate({ wins: 0, losses: 0, draws: 0 })).toBeNull();
  });
  it('gives an account the same portrait every time, within the 11 fighters', () => {
    expect(mascotOf('aiko-8197.mempire-relay-41966.testnet')).toBe(mascotOf('aiko-8197.mempire-relay-41966.testnet'));
    for (const a of ['a', 'b', 'aiko', 'bram', 'x.testnet']) expect(mascotOf(a)).toBeGreaterThanOrEqual(0), expect(mascotOf(a)).toBeLessThan(11);
  });
});

describe('card numbers match the sim', () => {
  it('builds hit points from the same level-1 + trait + market maths the engine uses', () => {
    const btc = 6;
    const card: MatchCard = { fighterId: btc, name: 'BTC', archetype: 0, trait: traitFor('BTC'), level: 1, metaBps: 1000 };
    const sim = createMatch(7, [[card, card, card, card, card, card, card, card], [card, card, card, card, card, card, card, card]], FORMATS.rush);
    expect(statsOf(btc, 1000).hp).toBeGreaterThan(statsOf(btc, 0).hp!);
    expect(statsOf(btc, 0).elixir).toBe(4);
    expect(statsOf(7).hp).toBeNull();
    expect(sim.players[0].deck[0].metaBps).toBe(1000);
  });
});

describe('referee receipts', () => {
  it('maps recorded testnet transactions to their match ids', () => {
    expect(receiptTxs('2').some((t) => /opens Rush match #2/.test(t.label) && t.source === 'recorded')).toBe(true);
    expect(receiptTxs('8').some((t) => /Referee settled #8/.test(t.label))).toBe(true);
    expect(receiptTxs('99999')).toEqual([]);
  });
  it('counts crowns from tower hit points: a fallen king keep is all three', () => {
    const card: MatchCard = { fighterId: 0, name: 'WIF', archetype: 0, trait: traitFor('WIF'), level: 1, metaBps: 0 };
    const sim = createMatch(1, [Array(8).fill(card), Array(8).fill(card)], FORMATS.rush);
    expect(crownsTaken(sim, 0)).toBe(0);
    sim.towers.find((t) => t.owner === 1 && t.kind === 'princess')!.hp = 0;
    expect(crownsTaken(sim, 0)).toBe(1);
    sim.towers.find((t) => t.owner === 1 && t.kind === 'king')!.hp = 0;
    expect(crownsTaken(sim, 0)).toBe(3);
  });
});
