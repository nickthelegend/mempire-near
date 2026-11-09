import { create } from 'zustand';
import { addresses, ArenaClient, type Deployment } from '@mempire/sdk';
import { chainId, publicClient } from '../chain/wallet';
interface ChainState { deployment?: Deployment; arena?: ArenaClient; loading: boolean; error?: string; load: () => Promise<void> }
export const useChainStore = create<ChainState>(set => ({ loading: true, load: async () => {
  set({ loading: true, error: undefined });
  try {
    const actual = await publicClient.getChainId();
    if (actual !== chainId) throw new Error(`RPC is chain ${actual}; expected ${chainId}`);
    const deployment = await addresses(chainId);
    const code = await publicClient.getCode({ address: deployment.arena });
    if (!code || code === '0x') throw new Error('Deployment address has no contract code');
    set({ deployment, arena: new ArenaClient(publicClient, deployment.arena), loading: false });
  } catch (e) { set({ loading: false, error: (e as Error).message }); }
} }));
