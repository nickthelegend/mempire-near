import { roster } from '@mempire/sdk';
import { coinByMint } from '../lib/coins';
import type { Archetype } from '@mempire/sim';
export * from '@mempire/sim';
export function archetypeForMint(mint:string):Archetype { const id=coinByMint(mint)?.coinId;if(id===undefined)throw new Error('Unknown NEAR fighter');return roster.fighters[id].archetype as Archetype; }
