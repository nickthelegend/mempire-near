// SPDX-License-Identifier: MIT
// Market Pulse: the signed relayer prices the arena holds (get_prices), loaded once and shared.
import { useEffect } from 'react';
import { create } from 'zustand';
import { moveBps, priceUsd, roster } from '@mempire/sdk';
import { reader } from './data';

export type PulseState = 'live' | 'stale' | 'noprice' | 'house';
export interface Pulse { fighterId: number; ticker: string; price: number | null; moveBps: number | null; statBps: number; state: PulseState; updatedAt: number }
interface MarketStore { byId: Map<number, Pulse>; list: Pulse[]; source: string; loading: boolean; error: string | null; readAt: number; subscribers: number }
export const useMarketStore = create<MarketStore>(() => ({ byId: new Map(), list: [], source: '', loading: true, error: null, readAt: 0, subscribers: 0 }));

let inFlight: Promise<void> | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
async function load() {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const p = await reader.prices();
      const list: Pulse[] = p.prices.map((r) => ({
        fighterId: r.fighter_id, ticker: r.ticker,
        price: r.status === 4 ? null : priceUsd(r.last_e8),
        moveBps: r.status === 4 ? null : moveBps(r.open_e8, r.last_e8),
        statBps: r.stat_bps, state: r.status === 0 ? 'live' : r.status === 2 ? 'stale' : 'noprice', updatedAt: Number(r.ts_ms) / 1000,
      }));
      for (const f of roster.fighters) if (f.kind === 'house') list.push({ fighterId: f.fighterId, ticker: f.ticker, price: null, moveBps: null, statBps: 0, state: 'house', updatedAt: 0 });
      useMarketStore.setState({ list, byId: new Map(list.map((x) => [x.fighterId, x])), source: p.source, loading: false, error: null, readAt: Date.now() });
    } catch (e) { useMarketStore.setState((s) => ({ ...s, loading: false, error: (e as Error).message })); }
    finally { inFlight = null; }
  })();
  return inFlight;
}
export function useMarket() {
  useEffect(() => {
    useMarketStore.setState((s) => ({ subscribers: s.subscribers + 1 }));
    if (Date.now() - useMarketStore.getState().readAt > 55_000) void load();
    if (!timer) timer = setInterval(() => void load(), 60_000);
    return () => {
      useMarketStore.setState((s) => ({ subscribers: s.subscribers - 1 }));
      if (useMarketStore.getState().subscribers <= 0 && timer) { clearInterval(timer); timer = null; }
    };
  }, []);
  return useMarketStore();
}
export function statFor(byId: Map<number, Pulse>, id: number): number | null { const p = byId.get(id); return p ? p.statBps : null; }
export const PULSE_LABEL: Record<PulseState, string> = { live: 'Live', stale: 'Stale: neutral', noprice: 'No price yet', house: 'House: no price' };
