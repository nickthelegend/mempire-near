// SPDX-License-Identifier: MIT
// The player's NEAR account: a sub-account the relayer creates for a key generated in this browser.
// The full-access key never leaves localStorage; everything except stakes goes out as NEP-366 meta
// transactions the relayer pays for. Per-match session keys (play only) are stored per match id.
import { create } from 'zustand';
import { KeyPair, KeySigner, RelayerClient, viewAccount, type RelayerInfo } from '@mempire/sdk';
import { net } from '../lib/net';

const DEVICE = 'mempire:near:device';
interface Device { accountId: string; key: string; email?: string }

function read(): Device | null {
  try { const raw = localStorage.getItem(DEVICE); return raw ? JSON.parse(raw) as Device : null; } catch { return null; }
}

export const relayer = new RelayerClient(net.relayer!);

interface AccountState {
  device: Device | null;
  signer: KeySigner | null;
  balance: bigint | null;
  relayerInfo: RelayerInfo | null;
  relayerError: string | null;
  busy: string;
  error: string;
  loadRelayer: () => Promise<void>;
  refresh: () => Promise<void>;
  guest: (handle: string) => Promise<void>;
  startEmail: (email: string) => Promise<void>;
  verifyEmail: (email: string, code: string) => Promise<void>;
  signOut: () => void;
}

const pendingKey = () => {
  let k = sessionStorage.getItem('mempire:near:pending');
  if (!k) { k = KeyPair.fromRandom('ed25519').toString(); sessionStorage.setItem('mempire:near:pending', k); }
  return KeyPair.fromString(k as never);
};

const initial = read();
export const useAccount = create<AccountState>((set, get) => ({
  device: initial,
  signer: initial ? new KeySigner(net.rpc, initial.accountId, KeyPair.fromString(initial.key as never)) : null,
  balance: null, relayerInfo: null, relayerError: null, busy: '', error: '',
  loadRelayer: async () => {
    try { set({ relayerInfo: await relayer.info(), relayerError: null }); }
    catch (e) { set({ relayerError: `Relayer unreachable at ${net.relayer} (${(e as Error).message}). Start it with pnpm --filter @mempire/relayer start.` }); }
  },
  refresh: async () => {
    const d = get().device; if (!d) return;
    try { set({ balance: BigInt((await viewAccount(net.rpc, d.accountId)).amount) }); } catch { /* account may still be propagating */ }
  },
  guest: async (handle) => {
    set({ busy: 'Creating your NEAR account', error: '' });
    try {
      const kp = pendingKey();
      const res = await relayer.guest(handle || 'player', kp.getPublicKey().toString());
      const device = { accountId: res.accountId, key: kp.toString() };
      localStorage.setItem(DEVICE, JSON.stringify(device));
      sessionStorage.removeItem('mempire:near:pending');
      set({ device, signer: new KeySigner(net.rpc, device.accountId, kp), busy: '' });
      setTimeout(() => void get().refresh(), 1500);
    } catch (e) { set({ busy: '', error: (e as Error).message }); }
  },
  startEmail: async (email) => {
    set({ busy: 'Sending your code', error: '' });
    try { await relayer.startEmail(email); set({ busy: '' }); }
    catch (e) { set({ busy: '', error: (e as Error).message }); throw e; }
  },
  verifyEmail: async (email, code) => {
    set({ busy: 'Checking the code', error: '' });
    try {
      const kp = pendingKey();
      const res = await relayer.verifyEmail(email, code, kp.getPublicKey().toString());
      const device = { accountId: res.accountId, key: kp.toString(), email };
      localStorage.setItem(DEVICE, JSON.stringify(device));
      sessionStorage.removeItem('mempire:near:pending');
      set({ device, signer: new KeySigner(net.rpc, device.accountId, kp), busy: '' });
    } catch (e) { set({ busy: '', error: (e as Error).message }); }
  },
  signOut: () => { localStorage.removeItem(DEVICE); set({ device: null, signer: null, balance: null }); },
}));

export const sessionKeyFor = (id: string) => { try { return localStorage.getItem(`mempire:near:session:${id}`); } catch { return null; } };
export const saveSessionKey = (id: string, key: string) => localStorage.setItem(`mempire:near:session:${id}`, key);
export const dropSessionKey = (id: string) => localStorage.removeItem(`mempire:near:session:${id}`);
