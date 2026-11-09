// SPDX-License-Identifier: MIT
// The v3 art set (fighters: artOf in fighters.ts): bright, chunky 3D cartoon renders generated for Mempire (original characters).
// Every image has a styled fallback in the UI, so a file that has not landed yet never shows a broken icon.
const V3 = '/art/v3';
const at = (name: string) => `${V3}/mp3-${name}.webp`;

export const ART = {
  keyart: at('keyart'),
  keyartPortrait: at('keyart-portrait'),
  arena: at('arena'),
  towerHome: at('tower-home'),
  towerFoe: at('tower-foe'),
  chest: at('chest'),
  crown: at('crown'),
  trophy: at('trophy'),
  logo: at('logo'),
} as const;

export const badgeArt = (tier: 'pauper' | 'knight' | 'duke' | 'emperor') => at(`badge-${tier}`);
/** House crest by house name (Kumo, Tora, Ryu); null for an unknown house. */
export function houseArt(name: string): string | null {
  const key = name.trim().toLowerCase();
  return ['kumo', 'tora', 'ryu'].includes(key) ? at(`house-${key}`) : null;
}
