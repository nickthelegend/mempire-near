// SPDX-License-Identifier: MIT
import type { Network } from '@mempire/sdk';
import deployment from '../../../../deployments/testnet.json';

export const net: Network = {
  networkId: 'testnet',
  rpc: import.meta.env.VITE_NEAR_RPC_URL || 'https://test.rpc.fastnear.com',
  arena: import.meta.env.VITE_ARENA_ACCOUNT || deployment.arena,
  relayer: import.meta.env.VITE_RELAYER_URL || 'http://127.0.0.1:5299',
  explorer: 'https://testnet.nearblocks.io',
};
export const deploymentInfo = deployment as {
  arena: string; treasury: string; relayer: string; priceRelayerKey: string; deployTxs: { step: string; hash: string; url: string }[];
  houses: { name: string; account: string; difficulty: number; stake: string }[];
};
export const txUrl = (hash: string) => `${net.explorer}/txns/${hash}`;
export const accountUrl = (id: string) => `${net.explorer}/address/${id}`;
