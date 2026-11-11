import { traitFor } from '@mempire/sim';
import { coinByMint } from '../lib/coins';
export * from '@mempire/sim';
export const traitForMint=(mint:string)=>traitFor(coinByMint(mint)?.ticker ?? mint);
