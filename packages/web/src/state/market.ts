import { useEffect } from 'react';
import { create } from 'zustand';
import { parseAbi, type Address } from 'viem';
import { roster } from '@mempire/sdk';
import { publicClient } from '../chain/wallet';
import { useChainStore } from './chain';
import { statBpsFromMove } from '../lib/fighters';

/**
 * Market Pulse: one shared read of every fighter's Chainlink feed, the way the arena will read it at
 * kick-off. Many components show it (the ticker band, cards, the desktop side panel), so it is loaded
 * once and refreshed every minute while anything is subscribed, instead of once per component.
 */
export type PulseState = 'live' | 'closed' | 'paused' | 'nohistory' | 'house';
export interface Pulse {
  fighterId: number;
  ticker: string;
  price: number | null; // USD
  moveBps: number | null; // 24 h move
  statBps: number; // what the arena would store now: 2x the move, capped at ±15%; 0 when neutral
  state: PulseState;
  updatedAt: number; // unix seconds of the latest round, 0 for house fighters
}
interface MarketStore {
  byId: Map<number, Pulse>;
  list: Pulse[];
  loading: boolean;
  error: string | null;
  readAt: number;
  subscribers: number;
}
export const useMarketStore = create<MarketStore>(() => ({ byId: new Map(), list: [], loading: true, error: null, readAt: 0, subscribers: 0 }));

const pausedAbi = parseAbi(['function oraclePaused() view returns (bool)']);
let inFlight: Promise<void> | null = null;
let timer: ReturnType<typeof setInterval> | null = null;

async function load() {
  const arena = useChainStore.getState().arena;
  if (!arena) return;
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const prices = await arena.livePrices();
      const list: Pulse[] = await Promise.all(prices.map(async (p) => {
        const f = roster.fighters[p.fighterId];
        const paused = f.kind === 'stock' && f.token
          ? await publicClient.readContract({ address: f.token as Address, abi: pausedAbi, functionName: 'oraclePaused' })
          : false;
        const state: PulseState = paused ? 'paused' : p.stale ? 'closed' : p.moveBps === null ? 'nohistory' : 'live';
        return {
          fighterId: p.fighterId, ticker: p.ticker,
          price: Number(p.price) / 10 ** (f.feedDecimals ?? 8),
          moveBps: p.moveBps, statBps: state === 'live' ? statBpsFromMove(p.moveBps!) : 0,
          state, updatedAt: Number(p.updatedAt),
        };
      }));
      for (const f of roster.fighters) if (f.kind === 'house') list.push({ fighterId: f.fighterId, ticker: f.ticker, price: null, moveBps: null, statBps: 0, state: 'house', updatedAt: 0 });
      useMarketStore.setState({ list, byId: new Map(list.map((x) => [x.fighterId, x])), loading: false, error: null, readAt: Date.now() });
    } catch (e) {
      useMarketStore.setState((s) => ({ ...s, loading: false, error: (e as Error).message }));
    } finally { inFlight = null; }
  })();
  return inFlight;
}

/** Subscribe to the shared market read. */
export function useMarket() {
  const arena = useChainStore((s) => s.arena);
  useEffect(() => {
    if (!arena) return;
    useMarketStore.setState((s) => ({ subscribers: s.subscribers + 1 }));
    const { readAt } = useMarketStore.getState();
    if (Date.now() - readAt > 55_000) void load();
    if (!timer) timer = setInterval(() => void load(), 60_000);
    return () => {
      useMarketStore.setState((s) => ({ subscribers: s.subscribers - 1 }));
      if (useMarketStore.getState().subscribers <= 0 && timer) { clearInterval(timer); timer = null; }
    };
  }, [arena]);
  return useMarketStore();
}

/** Today's stat change for a fighter, or null while unknown. */
export function statFor(byId: Map<number, Pulse>, id: number): number | null {
  const p = byId.get(id);
  return p ? p.statBps : null;
}

export const PULSE_LABEL: Record<PulseState, string> = {
  live: 'Live', closed: 'Market closed', paused: 'Oracle paused', nohistory: 'No 24 h history', house: 'House: no feed',
};
