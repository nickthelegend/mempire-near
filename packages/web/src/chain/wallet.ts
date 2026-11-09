import { createPublicClient, createWalletClient, custom, encodeFunctionData, http, type Address, type EIP1193Provider, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { generatePrivateKey } from 'viem/accounts';
import { defineChain } from 'viem';
import { erc20Abi, roster, wif } from '@mempire/sdk';

export const isFork = import.meta.env.VITE_CHAIN === 'fork';
export const chainId = isFork ? 31337 : 4663;
export const rpcUrl = import.meta.env.VITE_RPC_URL || (isFork ? 'http://127.0.0.1:8547' : 'https://rpc.mainnet.chain.robinhood.com');
export const explorer = 'https://robinhoodchain.blockscout.com';
export const chain = defineChain({ id: chainId, name: isFork ? 'Anvil fork of chain 4663' : 'Robinhood Chain', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [rpcUrl] } }, blockExplorers: { default: { name: 'Blockscout', url: explorer } } });
export const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
const burnerKey = 'mempire:fork:burner';
export function forkFundingAllowed(id: number, mode: 'fork' | 'mainnet') { return mode === 'fork' && id === 31337; }
export function burner() {
  if (!isFork) throw new Error('Fork only');
  let key = localStorage.getItem(burnerKey) as Hex | null;
  if (!key) { key = generatePrivateKey(); localStorage.setItem(burnerKey, key); }
  return privateKeyToAccount(key);
}
export function newSession() { return privateKeyToAccount(generatePrivateKey()); }
export function walletFor(account: ReturnType<typeof burner>) { return createWalletClient({ account, chain, transport: http(rpcUrl) }); }
export interface InjectedWallet { info: { name: string; uuid: string }; provider: EIP1193Provider }
export function discoverWallets(onWallet: (wallet: InjectedWallet) => void) {
  const seen = new Set<string>();
  const handler = (event: Event) => {
    const detail = (event as CustomEvent<InjectedWallet>).detail;
    if (detail?.info?.uuid && !seen.has(detail.info.uuid)) { seen.add(detail.info.uuid); onWallet(detail); }
  };
  window.addEventListener('eip6963:announceProvider', handler);
  window.dispatchEvent(new Event('eip6963:requestProvider'));
  return () => window.removeEventListener('eip6963:announceProvider', handler);
}
export async function connectInjected(provider: EIP1193Provider) {
  const ids = await provider.request({ method: 'eth_requestAccounts' }) as Address[];
  try { await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x1237' }] }); }
  catch (error) {
    if ((error as { code?: number }).code !== 4902) throw error;
    await provider.request({ method: 'wallet_addEthereumChain', params: [{ chainId: '0x1237', chainName: 'Robinhood Chain', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: ['https://rpc.mainnet.chain.robinhood.com'], blockExplorerUrls: [explorer] }] });
  }
  return { address: ids[0], wallet: createWalletClient({ account: ids[0], chain, transport: custom(provider) }) };
}
const holderWif = '0xe89de31f1423f6041851ffa974a9f29a06ef8e11' as Address;
const stockPool = '0x8366a39cc670b4001a1121b8f6a443a643e40951' as Address;
/** Fork-only impersonation. Every token transfer is mined on the local fork. */
export async function fundOnFork(to: Address, tickers: string[] = ['NVDA', 'AMD']) {
  const actual = await publicClient.getChainId();
  if (!forkFundingAllowed(actual, isFork ? 'fork' : 'mainnet')) throw new Error('Fork funding is unavailable on this chain');
  const rpc = (method: string, params: unknown[]) => publicClient.request({ method, params } as never);
  const hashes: Hex[] = [];
  await rpc('anvil_setBalance', [to, '0x16345785D8A0000']);
  for (const item of [{ token: wif, from: holderWif, amount: 100000n * 10n ** 18n, ticker: 'WIF' }, ...tickers.map(ticker => {
    const fighter = roster.fighters.find(f => f.ticker === ticker && f.token);
    if (!fighter?.token) throw new Error(`Unknown Stock Token ${ticker}`);
    return { token: fighter.token as Address, from: stockPool, amount: 10n ** 18n, ticker };
  })]) {
    const balance = await publicClient.readContract({ address: item.token, abi: erc20Abi, functionName: 'balanceOf', args: [item.from] });
    if (balance < item.amount) throw new Error(`${item.ticker} source has insufficient balance`);
    await rpc('anvil_setBalance', [item.from, '0xDE0B6B3A7640000']);
    await rpc('anvil_impersonateAccount', [item.from]);
    try {
      const hash = await createWalletClient({ chain, transport: http(rpcUrl) }).sendTransaction({ account: item.from, to: item.token, data: encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [to, item.amount] }) });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== 'success') throw new Error(`${item.ticker} transfer failed`);
      hashes.push(hash);
    } finally { await rpc('anvil_stopImpersonatingAccount', [item.from]); }
  }
  return hashes;
}
