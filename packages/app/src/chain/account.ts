import { KeySigner, KeyPair, rpc, parseOutcome, fnCall, type TxOutcome } from '@mempire/sdk';
import type { WalletSelector, InjectedWallet, InternalAction } from '@near-wallet-selector/core';
import { net } from './provider';
export interface Signer {
  kind: 'guest' | 'injected'; address: string; accountId: string; keySigner?: KeySigner;
  send: KeySigner['send']; call: KeySigner['call'];
}
let current: Signer | null = null;
export const activeSigner = () => current;
export const canSign = () => !!current;
export const setSigner = (s: Signer | null) => { current = s; };
export function guestSigner(accountId: string, key: string): Signer {
  const keySigner = new KeySigner(net.rpc, accountId, KeyPair.fromString(key as never));
  return { kind: 'guest', address: accountId, accountId, keySigner,
    send: keySigner.send.bind(keySigner), call: keySigner.call.bind(keySigner) };
}
let selectorPromise: Promise<WalletSelector> | null = null;
async function selector() {
  selectorPromise ??= Promise.all([import('@near-wallet-selector/core'), import('@near-wallet-selector/meteor-wallet')])
    .then(([core, meteor]) => core.setupWalletSelector({ network: 'testnet',
      fallbackRpcUrls: ['https://rpc.testnet.near.org'], modules: [meteor.setupMeteorWallet()] }));
  return selectorPromise;
}
export async function meteorWallet() { return (await selector()).wallet<InjectedWallet>('meteor-wallet'); }
export async function connectMeteor(): Promise<Signer> {
  const wallet = await meteorWallet();
  const accounts = await wallet.signIn({ contractId: net.arena, methodNames: ['play'] });
  const id = accounts[0]?.accountId;
  if (!id) throw new Error('Meteor did not return a NEAR testnet account.');
  return meteorSigner(id);
}
export async function restoreMeteor(): Promise<Signer | null> {
  if (!localStorage.getItem('near-wallet-selector:selectedWalletId')) return null;
  const state = (await selector()).store.getState();
  const id = state.accounts.find(a => a.active)?.accountId;
  return id ? meteorSigner(id) : null;
}
export async function disconnectMeteor() { await (await meteorWallet()).signOut(); }
async function walletActions(actions: Parameters<KeySigner['send']>[1]) {
  const {internalActionToNaj}=await import('@near-wallet-selector/core');
  const internal=actions.map((action):InternalAction => {
    if (action.enum === 'functionCall') {
      const a = action.functionCall;
      return { type: 'FunctionCall', params: { methodName: a.methodName,
        args: JSON.parse(new TextDecoder().decode(a.args)), gas: a.gas.toString(), deposit: a.deposit.toString() } };
    }
    if (action.enum === 'addKey') {
      const a = action.addKey; const p = a.accessKey.permission.functionCall;
      if (!p) throw new Error('Only scoped function-call keys are added by Mempire.');
      return { type: 'AddKey', params: { publicKey: a.publicKey.toString(), accessKey: { nonce: 0,
        permission: { receiverId: p.receiverId, methodNames: p.methodNames, allowance: p.allowance?.toString() } } } };
    }
    if (action.enum === 'deleteKey') return { type: 'DeleteKey', params: { publicKey: action.deleteKey.publicKey.toString() } };
    throw new Error('This action is not used by the NEAR game.');
  });
  return internal.map(internalActionToNaj);
}
function meteorSigner(accountId: string): Signer {
  const send: KeySigner['send'] = async (receiverId, actions, onSigned) => {
    const out = await (await meteorWallet()).signAndSendTransaction({ receiverId, actions: await walletActions(actions) });
    if (!out) throw new Error('Meteor returned no transaction. Check NearBlocks before retrying.');
    const hash = out.transaction.hash; onSigned?.(hash);
    const final = await rpc<Parameters<typeof parseOutcome>[0]>(net.rpc, 'tx', {
      tx_hash: hash, sender_account_id: accountId, wait_until: 'EXECUTED_OPTIMISTIC' });
    return parseOutcome(final);
  };
  const call: KeySigner['call'] = async (contract, method, args, opts = {}) => {
    const out = await send(contract, [fnCall(method, args, opts.tgas ?? 30, opts.deposit ?? 0n)]);
    if (!out.ok) throw new Error(`${method}: ${out.error} (tx ${out.hash})`);
    return out as TxOutcome & { value?: never };
  };
  return { kind: 'injected', address: accountId, accountId, send, call };
}
