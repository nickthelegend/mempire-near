import { create } from 'zustand';
import type { Address, WalletClient } from 'viem';
import { burner, connectInjected, discoverWallets, isFork, walletFor, type InjectedWallet } from '../chain/wallet';
interface WalletState { address?: Address; wallet?: WalletClient; options: InjectedWallet[]; loading: boolean; error?: string; connect: (provider?: InjectedWallet['provider']) => Promise<void>; discover: () => () => void; }
const savedFork = isFork && localStorage.getItem('mempire:fork:burner') ? burner() : null;
export const useWalletStore = create<WalletState>((set, get) => ({
  options: [], loading: false,
  address: savedFork?.address, wallet: savedFork ? walletFor(savedFork) : undefined,
  discover: () => discoverWallets(option => set({ options: [...get().options.filter(x => x.info.uuid !== option.info.uuid), option] })),
  connect: async provider => {
    set({ loading: true, error: undefined });
    try {
      if (isFork) { const account = burner(); set({ address: account.address, wallet: walletFor(account), loading: false }); }
      else if (provider) { const connected = await connectInjected(provider); set({ ...connected, loading: false }); }
      else throw new Error('Select an injected wallet');
    } catch (e) { set({ error: (e as Error).message, loading: false }); }
  },
}));
export function useWallet() { const s = useWalletStore(); return { data: s.address ? { address: s.address, wallet: s.wallet } : null, loading: s.loading, error: s.error, connect: s.connect, options: s.options }; }
