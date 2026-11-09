// SPDX-License-Identifier: MIT
import { roster } from '@mempire/sdk';
export const defaultDeck = [0, 1, 2, 3, 4, 5, 6, 8];
const key = (account?: string | null) => `mempire:near:deck:${account ?? 'guest'}`;
export function loadDeck(account?: string | null): number[] {
  try { const raw = localStorage.getItem(key(account)); const d = raw ? JSON.parse(raw) as number[] : null; return d && validateDeck(d) === null ? d : [...defaultDeck]; } catch { return [...defaultDeck]; }
}
export function saveDeck(account: string | null | undefined, deck: number[]) { localStorage.setItem(key(account), JSON.stringify(deck)); }
export function validateDeck(deck: readonly number[]): string | null {
  if (deck.length !== 8 || new Set(deck).size !== 8) return 'Choose eight different fighters';
  for (const id of deck) if (!roster.fighters[id]) return `Unknown fighter ${id}`;
  return null;
}
