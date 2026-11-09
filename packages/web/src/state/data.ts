// SPDX-License-Identifier: MIT
import { useEffect, useState } from 'react';
import { ArenaReader } from '@mempire/sdk';
import { net } from '../lib/net';

export const reader = new ArenaReader(net);
export type Live<T> = { data: T | null; loading: boolean; error: string | null };
/** A hook whose inputs are not there yet: shown as loading, not as an error. */
export class NotReady extends Error { constructor() { super('Not ready'); } }

export function useLive<T>(load: () => Promise<T>, deps: readonly unknown[], interval = 15000): Live<T> {
  const [state, set] = useState<Live<T>>({ data: null, loading: true, error: null });
  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      try { const data = await load(); if (alive) set({ data, loading: false, error: null }); }
      catch (e) { if (!alive) return; if (e instanceof NotReady) set({ data: null, loading: true, error: null }); else set((s) => ({ ...s, loading: false, error: (e as Error).message })); }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), interval);
    const onChange = () => void refresh();
    window.addEventListener('mempire:chain-changed', onChange);
    return () => { alive = false; clearInterval(timer); window.removeEventListener('mempire:chain-changed', onChange); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}
export const chainChanged = () => window.dispatchEvent(new Event('mempire:chain-changed'));

export const useConfig = () => useLive(() => reader.config(), [], 120000);
export const useTotals = () => useLive(() => reader.totals(), []);
export const useRecent = (limit = 12) => useLive(() => reader.recent(limit), [limit]);
export const useHouses = () => useLive(() => reader.houses(), []);
export const useOpen = () => useLive(() => reader.openMatches(), [], 6000);
export function useSeason(account?: string | null) {
  return useLive(async () => {
    const current = await reader.currentSeason();
    const [info, previous, points] = await Promise.all([
      reader.season(current), current > 0 ? reader.season(current - 1) : Promise.resolve(null),
      account ? reader.points(current, account) : Promise.resolve(null),
    ]);
    return { current, info, previous, points };
  }, [account]);
}
export const usePlayer = (account?: string | null) => useLive(async () => { if (!account) throw new NotReady(); return reader.player(account); }, [account]);
