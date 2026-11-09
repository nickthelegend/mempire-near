import { roster, type Deck } from '@mempire/sdk';
import { minHoldLabel } from '../lib/fighters';
export const defaultDeck = [0,1,2,3,4,5,15,16] as const satisfies Deck;
export function deckKey(address: string) { return `mempire:deck:${address.toLowerCase()}`; }
export function loadDeck(address: string): number[] { try { const raw = localStorage.getItem(deckKey(address)); return raw ? JSON.parse(raw) as number[] : [...defaultDeck]; } catch { return [...defaultDeck]; } }
export function saveDeck(address: string, deck: number[]) { localStorage.setItem(deckKey(address), JSON.stringify(deck)); }
export function validateDeck(deck: readonly number[], eligible: ReadonlySet<number>): string | null {
  if (deck.length !== 8 || new Set(deck).size !== 8) return 'Choose eight distinct fighters';
  for (const id of deck) {
    const f = roster.fighters[id];
    if (!f) return `Unknown fighter ${id}`;
    if (f.kind !== 'house' && !eligible.has(id)) return `${f.ticker} needs at least ${minHoldLabel(f)} in your wallet`;
  }
  return null;
}
