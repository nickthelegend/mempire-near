// SPDX-License-Identifier: MIT
import { roster } from '@mempire/sdk';
import { ARCHETYPES, FP, TICKS_PER_SEC, TRAITS, effectiveDef, scaleStat, traitFor, type Archetype } from '@mempire/sim';

export type Fighter = (typeof roster.fighters)[number];

export const fighter = (id: number): Fighter => {
  const f = roster.fighters[id];
  if (!f) throw new Error(`Unknown fighter ${id}`);
  return f;
};
/** Full-body cartoon render per fighter (v3 art set, transparent background). */
export const artOf = (id: number) => `/art/v3/mp3-${fighter(id).art}.webp`;
export const characterOf = (id: number) => fighter(id).name;
/** Frame rarity is earned from the market: house fighters common, market fighters rare, a buffed one epic. */
export type Rarity = 'common' | 'rare' | 'epic';
export function rarityOf(id: number, statBps: number | null | undefined): Rarity {
  if (fighter(id).kind === 'house') return 'common';
  return statBps != null && statBps > 0 ? 'epic' : 'rare';
}
export const costOf = (id: number) => ARCHETYPES[fighter(id).archetype as keyof typeof ARCHETYPES].elixir;
export const CLASS_SLUGS = ['tank', 'swarm', 'ranged', 'splash', 'support', 'spell'] as const;
export const CLASS_NAMES = ['Tank', 'Swarm', 'Ranged', 'Splash', 'Support', 'Spell'] as const;

/** The arena's stat effect from a 24 h move: twice the move, capped at ±15 %. */
export function statBpsFromMove(moveBps: number): number {
  return Math.max(-1500, Math.min(1500, Math.trunc(moveBps * 2)));
}
export const pct = (bps: number, digits = 1) => `${bps > 0 ? '+' : bps < 0 ? '−' : '±'}${Math.abs(bps / 100).toFixed(digits)}%`;

/** Market status codes stored at kick-off (lib.rs): 0 live, 1 house, 2 stale, 4 no price. */
export function statusLabel(status: number): { short: string; long: string; live: boolean } {
  switch (status) {
    case 0: return { short: 'Live', long: 'Relayer price (testnet), signed and verified on-chain', live: true };
    case 1: return { short: 'House', long: 'House fighter: no price, always neutral', live: false };
    case 2: return { short: 'Stale', long: 'Price older than 6 h at kick-off: neutral', live: false };
    case 4: return { short: 'No price', long: 'No signed price posted yet: neutral', live: false };
    default: return { short: 'Unknown', long: `Unknown status ${status}`, live: false };
  }
}

export const shortAcct = (a?: string | null) => {
  if (!a) return '';
  const [head, ...rest] = a.split('.');
  const h = head.length > 14 ? `${head.slice(0, 12)}…` : head;
  return rest.length ? `${h}.${rest.length > 1 ? '…' : rest[0]}` : h;
};
export function shortError(message: string, max = 180): string {
  const first = message.split('\n')[0].trim();
  return first.length > max ? `${first.slice(0, max - 1)}…` : first;
}
export const TIER_BADGES = ['pauper', 'knight', 'duke', 'emperor'] as const;
export const HOUSE_LEVEL = ['Easy', 'Normal', 'Hard'] as const;

/** A card's battle numbers exactly as the sim builds them (level 1, its trait folded in, then the market change). */
export function statsOf(id: number, bps = 0) {
  const f = fighter(id);
  const arch = f.archetype as Archetype;
  const trait = traitFor(f.ticker);
  const def = effectiveDef(ARCHETYPES[arch], trait, arch);
  const spell = f.archetype === 5;
  return {
    trait: TRAITS[trait],
    elixir: def.elixir,
    hp: spell ? null : scaleStat(def.hp, 1, bps),
    baseHp: spell ? null : scaleStat(def.hp, 1, 0),
    damage: scaleStat(def.damage, 1, bps),
    baseDamage: scaleStat(def.damage, 1, 0),
    hitSpeed: spell ? null : def.hitTicks / TICKS_PER_SEC,
    range: spell ? null : def.rangeFP / FP,
    speed: spell ? null : (def.speedFP * TICKS_PER_SEC) / FP,
    count: def.count,
    splash: def.splashFP ? def.splashFP / FP : null,
    aura: def.auraFP ? def.auraFP / FP : null,
    delay: spell ? def.spellDelayTicks / TICKS_PER_SEC : null,
  };
}
export const CLASS_BLURB = [
  'Slow and huge. Walks to the nearest tower and soaks the hits.',
  'Four quick fighters at once. Great at swarming a single big target.',
  'Shoots from far away. Keep something in front of it.',
  'Hits everything around its target. Clears swarms.',
  'Makes nearby friends attack faster.',
  'Lands anywhere on the field after one second and blasts an area.',
] as const;
