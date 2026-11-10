// SPDX-License-Identifier: MIT
// Every match the arena has stored, read page by page with recent_matches (50 per call, newest first) and shared by
// the leaderboard, the profile and the receipt pages. Ladders here are computed from those records only: nothing is
// stored off-chain and nothing is estimated.
import { useEffect } from 'react';
import { create } from 'zustand';
import type { MatchView } from '@mempire/sdk';
import { reader } from './data';
import { deploymentInfo } from '../lib/net';

interface HistoryStore { matches: MatchView[] | null; loading: boolean; error: string | null; readAt: number; subscribers: number }
export const useHistoryStore = create<HistoryStore>(() => ({ matches: null, loading: true, error: null, readAt: 0, subscribers: 0 }));

let inFlight: Promise<void> | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
async function load() {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const all: MatchView[] = [];
      let before: string | undefined;
      for (let page = 0; page < 40; page++) {
        const rows = await reader.recent(50, before);
        all.push(...rows);
        if (rows.length < 50) break;
        before = rows[rows.length - 1].id;
      }
      useHistoryStore.setState({ matches: all, loading: false, error: null, readAt: Date.now() });
    } catch (e) { useHistoryStore.setState((s) => ({ ...s, loading: false, error: (e as Error).message })); }
    finally { inFlight = null; }
  })();
  return inFlight;
}

/** All matches on the arena, newest first, refreshed every 30 s while a screen shows them. */
export function useHistory() {
  useEffect(() => {
    useHistoryStore.setState((s) => ({ subscribers: s.subscribers + 1 }));
    if (Date.now() - useHistoryStore.getState().readAt > 25_000) void load();
    if (!timer) timer = setInterval(() => void load(), 30_000);
    const onChange = () => void load();
    window.addEventListener('mempire:chain-changed', onChange);
    return () => {
      window.removeEventListener('mempire:chain-changed', onChange);
      useHistoryStore.setState((s) => ({ subscribers: s.subscribers - 1 }));
      if (useHistoryStore.getState().subscribers <= 0 && timer) { clearInterval(timer); timer = null; }
    };
  }, []);
  return useHistoryStore();
}

export const HOUSE_ACCOUNTS = new Set(deploymentInfo.houses.map((h) => h.account));
export const isHouse = (account: string | null | undefined) => !!account && HOUSE_ACCOUNTS.has(account);

export interface LadderRow {
  account: string; wins: number; losses: number; draws: number; played: number; won: bigint; staked: bigint;
  houseWins: number; lastMs: number; fighters: Map<number, number>;
}

/** The seat an account sat in, or null. */
export function seatOf(m: MatchView, account: string): 0 | 1 | null {
  if (m.p0 === account) return 0;
  if (m.p1 === account) return 1;
  return null;
}

/** Per-player results over settled matches (houses left out: they have their own page). */
export function ladder(matches: readonly MatchView[]): LadderRow[] {
  const rows = new Map<string, LadderRow>();
  const row = (a: string) => {
    let r = rows.get(a);
    if (!r) { r = { account: a, wins: 0, losses: 0, draws: 0, played: 0, won: 0n, staked: 0n, houseWins: 0, lastMs: 0, fighters: new Map() }; rows.set(a, r); }
    return r;
  };
  for (const m of matches) {
    if (m.state !== 3) continue;
    for (const seat of [0, 1] as const) {
      const a = seat === 0 ? m.p0 : m.p1;
      if (!a || isHouse(a)) continue;
      const r = row(a);
      r.played += 1;
      r.staked += BigInt(m.stake);
      r.lastMs = Math.max(r.lastMs, Number(m.settled_ms));
      for (const f of seat === 0 ? m.deck0 : m.deck1) r.fighters.set(f, (r.fighters.get(f) ?? 0) + 1);
      if (m.winner === 2) { r.draws += 1; r.won += BigInt(m.paid) / 2n; }
      else if (m.winner === seat) { r.wins += 1; r.won += BigInt(m.paid); if (m.house !== null) r.houseWins += 1; }
      else r.losses += 1;
    }
  }
  return [...rows.values()].sort((a, b) => b.wins - a.wins || (b.won > a.won ? 1 : b.won < a.won ? -1 : 0) || a.losses - b.losses || b.lastMs - a.lastMs);
}

/** Win rate as a whole percent, or null with no decided games. */
export const winRate = (r: { wins: number; losses: number; draws: number }) => {
  const n = r.wins + r.losses + r.draws;
  return n ? Math.round((r.wins / n) * 100) : null;
};

/** Most fielded fighters first. */
export const favourites = (fighters: Map<number, number>, n = 3) => [...fighters.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);

/**
 * A player's portrait: one of the eleven fighter renders, picked from the account name (FNV-1a), so every player keeps
 * the same face everywhere. It is an avatar, not a stat; "most fielded" fighters come from the decks on chain.
 */
export function mascotOf(account: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < account.length; i++) { h ^= account.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h % 11;
}
