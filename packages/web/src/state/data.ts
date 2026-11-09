import { useEffect, useState } from 'react';
import { arenaAbi, erc20Abi, roster, wif, type Deck } from '@mempire/sdk';
import { type Address } from 'viem';
import { publicClient } from '../chain/wallet';
import { useChainStore } from './chain';

type Live<T> = { data: T | null; loading: boolean; error: string | null };
/** A hook whose inputs (wallet, arena) are not there yet: shown as loading, not as an error. */
export class NotReady extends Error { constructor() { super('Not ready'); } }
export function useLive<T>(load: () => Promise<T>, deps: readonly unknown[], interval = 12000): Live<T> {
  const [state, set] = useState<Live<T>>({ data: null, loading: true, error: null });
  useEffect(() => {
    let alive = true;
    const refresh = async () => { try { const data = await load(); if (alive) set({ data, loading: false, error: null }); } catch (e) { if (!alive) return; if (e instanceof NotReady) set({ data: null, loading: true, error: null }); else set(s => ({...s, loading: false, error: (e as Error).message})); } };
    void refresh(); const timer = setInterval(() => void refresh(), interval);
    // A settled match changes balances, burns and the season at once: refresh now rather than on the next tick.
    const onChange = () => void refresh();
    window.addEventListener('mempire:chain-changed', onChange);
    return () => { alive = false; clearInterval(timer); window.removeEventListener('mempire:chain-changed', onChange); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}
export function useWifBalance(address?: Address) {
  const arena = useChainStore(s => s.arena);
  return useLive(async () => {
    if (!address || !arena) throw new NotReady();
    const [balance, allowance] = await Promise.all([
      publicClient.readContract({ address: wif, abi: erc20Abi, functionName: 'balanceOf', args: [address] }),
      publicClient.readContract({ address: wif, abi: erc20Abi, functionName: 'allowance', args: [address, arena.arena] }),
    ]);
    return { balance, allowance };
  }, [address, arena]);
}
export function useHoldings(address?: Address) {
  const arena = useChainStore(s => s.arena);
  return useLive(async () => { if (!address || !arena) throw new NotReady(); return arena.holdings(address); }, [address, arena]);
}
export function useBurnStats() {
  const deployment = useChainStore(s => s.deployment);
  const arena = useChainStore(s => s.arena);
  return useLive(async () => {
    if (!arena || !deployment) throw new NotReady();
    const [totalBurned, totalSupply, events] = await Promise.all([
      arena.totalBurned(), arena.wifSupply(), publicClient.getContractEvents({address: arena.arena, abi: arenaAbi, eventName: 'WifBurned', fromBlock: BigInt(deployment.block)}),
    ]);
    return {totalBurned, totalSupply, recent: events.slice(-10).reverse()};
  }, [arena, deployment]);
}
export function useSeason(address?: Address) {
  const arena = useChainStore(s => s.arena);
  return useLive(async () => {
    if (!arena) throw new NotReady();
    const [current, genesis, length] = await Promise.all([
      publicClient.readContract({address: arena.arena, abi: arenaAbi, functionName:'currentSeason'}),
      publicClient.readContract({address: arena.arena, abi: arenaAbi, functionName:'seasonGenesis'}),
      publicClient.readContract({address: arena.arena, abi: arenaAbi, functionName:'SEASON_LENGTH'}),
    ]);
    const [info, previous, points] = await Promise.all([arena.season(current), current > 0 ? arena.season(current - 1) : Promise.resolve(null), address ? publicClient.readContract({address: arena.arena, abi: arenaAbi, functionName:'pointsOf', args:[current,address]}) : Promise.resolve(null)]);
    const end = Number(genesis + BigInt(current + 1) * length);
    return {current, info, previous, points, end, canFinalize: current > 0 && previous !== null && !previous[3] && Date.now()/1000 >= Number(genesis + BigInt(current) * length)};
  }, [arena,address]);
}
export function usePlayerStats(address?: Address) {
  const arena = useChainStore(s => s.arena);
  return useLive(async () => { if (!arena || !address) throw new NotReady(); return arena.stats(address); }, [arena,address]);
}
export function useOpenMatches() {
  const arena = useChainStore(s => s.arena);
  return useLive(async () => {
    if (!arena) throw new NotReady();
    const ids = await Promise.all(Array.from({length:8},(_,i) => arena.waiting(Math.floor(i/2), i%2)));
    return ids.map((id,i) => ({tier:Math.floor(i/2), format:i%2, id}));
  }, [arena]);
}
export function useMatchHistory(address?: Address) {
  const arena = useChainStore(s => s.arena);
  const deployment = useChainStore(s => s.deployment);
  return useLive(async () => {
    if (!arena || !deployment || !address) throw new NotReady();
    const [settled, voided] = await Promise.all([
      publicClient.getContractEvents({address:arena.arena,abi:arenaAbi,eventName:'MatchSettled',fromBlock:BigInt(deployment.block)}),
      publicClient.getContractEvents({address:arena.arena,abi:arenaAbi,eventName:'MatchVoided',fromBlock:BigInt(deployment.block)}),
    ]);
    const events = [...settled.map(e=>({kind:'settled' as const, id:e.args.matchId!, hash:e.transactionHash, block:e.blockNumber, data:e.args})), ...voided.map(e=>({kind:'voided' as const,id:e.args.matchId!,hash:e.transactionHash,block:e.blockNumber,data:e.args}))];
    const matches = await Promise.all(events.map(async event => ({event, match:await arena.match(event.id)})));
    return matches.filter(x => x.match.p0.toLowerCase() === address.toLowerCase() || x.match.p1.toLowerCase() === address.toLowerCase()).sort((a,b)=>Number(b.event.block-a.event.block));
  }, [arena,deployment,address]);
}
export function eligibleSet(holdings: { fighterId: number; eligible: boolean }[] | null): Set<number> {
  const set = new Set<number>(roster.fighters.filter(f=>f.kind==='house').map(f=>f.fighterId));
  holdings?.forEach(h => { if (h.eligible) set.add(h.fighterId); });
  return set;
}
export function asDeck(ids: readonly number[]): Deck { return ids as unknown as Deck; }
