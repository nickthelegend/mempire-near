import type { MatchCard as NearCard, SimState as NearState } from '@mempire/sim';
export * from '@mempire/sim';
// coinId is the imported renderer's lookup key. fighterId is the NEAR referee's canonical ID.
export type MatchCard = NearCard & { coinId: string };
export type SimState = Omit<NearState,'players'> & { players: [Omit<NearState['players'][0],'deck'> & {deck:MatchCard[]},Omit<NearState['players'][1],'deck'> & {deck:MatchCard[]}] };
