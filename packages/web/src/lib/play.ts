// SPDX-License-Identifier: MIT
// Match flows from the browser. The stake is the only transaction the player signs and pays for;
// the session key (added before the stake) and everything after the match go through the relayer as
// NEP-366 meta transactions.
import { KeyPair, KeySigner, addSessionKey, arenaCalls, deleteKey, parseNear, viewAccessKeys, type Claim, type Deck } from '@mempire/sdk';
import { net } from './net';
import { relayer, saveSessionKey, sessionKeyFor, dropSessionKey } from '../state/account';
import { reader } from '../state/data';

export interface Step { label: string; hash?: string }
type Log = (s: Step) => void;

async function relay(signer: KeySigner, receiver: string, actions: Parameters<KeySigner['signDelegate']>[1], label: string, log: Log) {
  const out = await relayer.relay(await signer.signDelegate(receiver, actions));
  log({ label, hash: out.hash });
  if (!out.ok) throw new Error(`${label} failed: ${out.error}`);
  return out;
}

/** A fresh play-only function-call key on the player's account, added by meta transaction. */
export async function addSession(signer: KeySigner, log: Log) {
  const kp = KeyPair.fromRandom('ed25519');
  sessionStorage.setItem('mempire:near:pendingSession', kp.toString());
  await relay(signer, signer.accountId, [addSessionKey(kp.getPublicKey().toString(), net.arena, ['play'], parseNear('0.25'))], 'Session key added (play only, 0.25 NEAR gas allowance)', log);
  return kp;
}

export async function fight(signer: KeySigner, tier: number, format: 0 | 1, deck: Deck, stake: string, log: Log): Promise<{ id: string; active: boolean }> {
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

export async function challenge(signer: KeySigner, house: number, format: 0 | 1, deck: Deck, stake: string, log: Log) {
  const kp = await addSession(signer, log);
  const out = await signer.call<string>(net.arena, 'challenge_house', { house, format, deck, session_key: kp.getPublicKey().toString() }, { deposit: stake });
  const id = String(out.value);
  log({ label: `Staked against the house in match #${id}`, hash: out.hash });
  saveSessionKey(id, kp.toString());
  sessionStorage.removeItem('mempire:near:pendingSession');
  return id;
}

export async function cancel(signer: KeySigner, id: string, log: Log) {
  await relay(signer, net.arena, [arenaCalls.cancel(id)], `Match #${id} cancelled, stake refunded`, log);
  await removeSession(signer, id, log);
}

export async function settle(signer: KeySigner, id: string, claim: Claim, log: Log) {
  return relay(signer, net.arena, [arenaCalls.settle(id, claim)], `Referee settled #${id}`, log);
}

/** Delete the match's session key from the account (meta transaction), if it is still there. */
export async function removeSession(signer: KeySigner, id: string, log: Log) {
  const key = sessionKeyFor(id);
  if (!key) return;
  const pk = KeyPair.fromString(key as never).getPublicKey().toString();
  const keys = await viewAccessKeys(net.rpc, signer.accountId);
  if (keys.keys.some((k) => k.public_key === pk)) await relay(signer, signer.accountId, [deleteKey(pk)], 'Session key deleted from your account', log);
  dropSessionKey(id);
}
