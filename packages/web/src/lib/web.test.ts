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
