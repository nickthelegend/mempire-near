import deployment from '../../../../deployments/testnet.json';
import { ArenaReader, RelayerClient, type Network } from '@mempire/sdk';
export const NETWORK_LABEL = 'NEAR testnet';
export const CLUSTER = 'near-testnet';
export const IS_MAINNET = false;
export const NFT_ENABLED = false;
export const HAS_EXPLORER = true;
export const DEPLOYMENT = deployment;
const local=typeof location!=='undefined'&&/^(localhost|127\.0\.0\.1)$/.test(location.hostname);
export const RPC_URL=import.meta.env.VITE_NEAR_RPC_URL||(local?`${location.origin}/near-rpc`:'https://rpc.testnet.near.org');
export const net: Network = { networkId: 'testnet', rpc: RPC_URL, arena: deployment.arena,
  explorer: deployment.explorer, relayer: import.meta.env.VITE_RELAYER_URL || 'http://127.0.0.1:5399' };
export const reader = new ArenaReader(net);
export const relayer = new RelayerClient(net.relayer!);
export const explorerUrl = (id: string, kind: 'tx' | 'address' = 'tx') =>
  `${deployment.explorer}/${kind === 'tx' ? 'txns' : 'address'}/${id}`;
