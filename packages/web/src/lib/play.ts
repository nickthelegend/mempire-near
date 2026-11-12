// SPDX-License-Identifier: MIT
// Guests retain NEP-366 sponsorship for key management and settlement. Wallet players sign
// their own key management, stake and settlement; every card still uses the local play-only key.
import { KeyPair, KeySigner, addSessionKey, arenaCalls, deleteKey, parseNear, viewAccessKeys, type Claim, type Deck } from '@mempire/sdk';
import { isWalletSigner, type PlayerSigner } from './signing';
import { net } from './net';
import { relayer, saveSessionKey, sessionKeyFor, dropSessionKey } from '../state/account';
import { reader } from '../state/data';

export interface Step { label: string; hash?: string }
type Log = (s: Step) => void;

async function relay(signer: PlayerSigner, receiver: string, actions: Parameters<KeySigner['signDelegate']>[1], label: string, log: Log) {
  const out = isWalletSigner(signer) ? await signer.send(receiver,actions) : await relayer.relay(await signer.signDelegate(receiver, actions));
  log({ label, hash: out.hash });
  if (!out.ok) throw new Error(`${label} failed: ${out.error}`);
  return out;
}

/** A fresh play-only function-call key on the player's account, added by meta transaction. */
export async function addSession(signer: PlayerSigner, log: Log) {
  const kp = KeyPair.fromRandom('ed25519');
  sessionStorage.setItem('mempire:near:pendingSession', kp.toString());
  await relay(signer, signer.accountId, [addSessionKey(kp.getPublicKey().toString(), net.arena, ['play'], parseNear('0.25'))], 'Session key added (play only, 0.25 NEAR gas allowance)', log);
  return kp;
}

export async function fight(signer: PlayerSigner, tier: number, format: 0 | 1, deck: Deck, stake: string, log: Log): Promise<{ id: string; active: boolean }> {
  const open = await reader.openMatches();
  const waitingId = open[tier * 2 + format];
  let join: string | null = null;
  if (waitingId && waitingId !== '0') {
    const w = await reader.match(waitingId);
    if (w && w.state === 1 && w.p0 !== signer.accountId) join = waitingId;
  }
  const kp = await addSession(signer, log);
  const pk = kp.getPublicKey().toString();
  let id: string;
  if (join) {
    const out = await signer.call(net.arena, 'join_match', { id: join, deck, session_key: pk }, { deposit: stake });
    log({ label: `Staked and joined match #${join}; the arena read the market`, hash: out.hash });
    id = join;
  } else {
    const out = await signer.call<string>(net.arena, 'create_match', { tier, format, deck, session_key: pk }, { deposit: stake });
    id = String(out.value);
    log({ label: `Staked and opened match #${id}`, hash: out.hash });
  }
  saveSessionKey(id, kp.toString());
  sessionStorage.removeItem('mempire:near:pendingSession');
  const m = await reader.match(id);
  return { id, active: m?.state === 2 };
}

export async function challenge(signer: PlayerSigner, house: number, format: 0 | 1, deck: Deck, stake: string, log: Log) {
  const kp = await addSession(signer, log);
  try {
    const out = await signer.call<string>(net.arena, 'challenge_house', { house, format, deck, session_key: kp.getPublicKey().toString() }, { deposit: stake });
    const id = String(out.value);
    log({ label: `Staked against the house in match #${id}`, hash: out.hash });
    saveSessionKey(id, kp.toString());
    sessionStorage.removeItem('mempire:near:pendingSession');
    return id;
  } catch(error) {
    if(isWalletSigner(signer)) {
      const pk=kp.getPublicKey().toString();const keys=await viewAccessKeys(net.rpc,signer.accountId);
      const access=keys.keys.find(k=>k.public_key===pk)?.access_key.permission;
      if(access&&access!=='FullAccess'&&access.FunctionCall.receiver_id===net.arena&&access.FunctionCall.method_names.join(',')==='play')await relay(signer,signer.accountId,[deleteKey(pk)],'Unused play key deleted after a failed stake',log);
      sessionStorage.removeItem('mempire:near:pendingSession');
    }
    throw error;
  }
}

export async function cancel(signer: PlayerSigner, id: string, log: Log) {
  await relay(signer, net.arena, [arenaCalls.cancel(id)], `Match #${id} cancelled, stake refunded`, log);
  await removeSession(signer, id, log);
}

export async function settle(signer: PlayerSigner, id: string, claim: Claim, log: Log) {
  return relay(signer, net.arena, [arenaCalls.settle(id, claim)], `Referee settled #${id}`, log);
}

/** Delete the match's session key from the account (meta transaction), if it is still there. */
const cleaning=new Map<string,Promise<void>>();
export async function removeSession(signer: PlayerSigner,id:string,log:Log){const tag=signer.accountId+':'+id;const pending=cleaning.get(tag);if(pending)return pending;const job=removeSessionOnce(signer,id,log).finally(()=>cleaning.delete(tag));cleaning.set(tag,job);return job;}
async function removeSessionOnce(signer: PlayerSigner, id: string, log: Log) {
  const key = sessionKeyFor(id);
  if (!key) return;
  const pk = KeyPair.fromString(key as never).getPublicKey().toString();
  const keys = await viewAccessKeys(net.rpc, signer.accountId);
  const access=keys.keys.find(k=>k.public_key===pk);if(access){const permission=access.access_key.permission;if(permission==='FullAccess'||permission.FunctionCall.receiver_id!==net.arena||permission.FunctionCall.method_names.join(',')!=='play')throw Error('Refusing to delete a key outside this match scope');}
  if (access) await relay(signer, signer.accountId, [deleteKey(pk)], 'Session key deleted from your account', log);
  dropSessionKey(id);
}
