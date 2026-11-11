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
  vsBurst: at('vs-burst'),
  podium: at('podium'),
  receiptScroll: at('receipt-scroll'),
  practiceDummy: at('practice-dummy'),
} as const;

// The 3D object kit (docs/ART-3D.md): glossy candy-enamel objects with Mempire's tiny face, for heroes, feature cards,
// empty states and headers. Fighters keep their character renders above.
const OBJ = (name: string) => `/art/3d/mp-3d-${name}.webp`;
export const OBJ3D = {
  crown: OBJ('crown'),
  coin: OBJ('coin'),
  cards: OBJ('cards'),
  tower: OBJ('tower'),
  chest: OBJ('chest'),
  trophy: OBJ('trophy'),
  seal: OBJ('seal'),
  shield: OBJ('shield'),
  cloud: OBJ('cloud'),
  up: OBJ('up'),
  down: OBJ('down'),
} as const;

export const badgeArt = (tier: 'pauper' | 'knight' | 'duke' | 'emperor') => at(`badge-${tier}`);
/** House crest by house name (Kumo, Tora, Ryu); null for an unknown house. */
export function houseArt(name: string): string | null {
  const key = name.trim().toLowerCase();
  return ['kumo', 'tora', 'ryu'].includes(key) ? at(`house-${key}`) : null;
}
