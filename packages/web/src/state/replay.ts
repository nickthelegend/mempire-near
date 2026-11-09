import { arenaAbi, roster, type ArenaClient } from '@mempire/sdk';
import { cloneState, createMatch, FORMATS, hashState, stepSim, traitForMint, type InputEvent, type MatchCard, type SimState } from '@mempire/sim';
import { toHex, type Hex } from 'viem';
import { publicClient } from '../chain/wallet';

/**
 * Replay and verify a match from the chain alone: the seed (`seedOf`), both decks and their stored
 * market bps (`getMatch`) and every `Played` event, stepped through the same deterministic sim the
 * players ran. The final state hash is then compared with both seats' claims.
 */
export interface Replay {
  initial: SimState;
  inputs: InputEvent[];
  final: SimState;
  finalHash: Hex;
  plays: number;
  claims: { seat: 0 | 1; made: boolean; winner: number; endTick: number; finalHash: Hex; matches: boolean }[];
}

function cards(ids: readonly number[], mods: readonly number[]): MatchCard[] {
  return ids.map((id, i) => {
    const f = roster.fighters[Number(id)];
    return { fighterId: f.fighterId, name: f.ticker, archetype: f.archetype as MatchCard['archetype'], trait: traitForMint(f.ticker), level: 1, metaBps: Number(mods[i]) };
  });
}

export async function replayMatch(arena: ArenaClient, fromBlock: bigint, matchId: bigint): Promise<Replay> {
  const [m, seed, logs] = await Promise.all([
    arena.match(matchId),
    publicClient.readContract({ address: arena.arena, abi: arenaAbi, functionName: 'seedOf', args: [matchId] }),
    publicClient.getContractEvents({ address: arena.arena, abi: arenaAbi, eventName: 'Played', args: { matchId }, fromBlock }),
  ]);
  if (m.state < 2) throw new Error(`Match #${matchId} has not started, so there is nothing to replay`);
  const initial = createMatch(seed, [cards(m.deck0, m.mods.slice(0, 8)), cards(m.deck1, m.mods.slice(8))], m.format === 0 ? FORMATS.standard : FORMATS.rush);
  const inputs: InputEvent[] = logs.map((l) => ({ tick: Number(l.args.tick), player: Number(l.args.seat) as 0 | 1, deckIndex: Number(l.args.deckIndex), x: Number(l.args.x), y: Number(l.args.y) }));
  const final = cloneState(initial);
  const maxTicks = m.format === 0 ? 4800 : 600;
  while (final.phase !== 'ended' && final.tick <= maxTicks + 1) stepSim(final, inputs.filter((e) => e.tick === final.tick));
  const finalHash = toHex(hashState(final), { size: 32 });
  const claims = ([[0, m.claim0], [1, m.claim1]] as const).map(([seat, c]) => ({
    seat: seat as 0 | 1, made: c.made, winner: Number(c.winner), endTick: Number(c.endTick), finalHash: c.finalHash as Hex,
    matches: c.made && (c.finalHash as string).toLowerCase() === finalHash.toLowerCase() && Number(c.endTick) === final.tick,
  }));
  return { initial, inputs, final, finalHash, plays: inputs.length, claims };
}
