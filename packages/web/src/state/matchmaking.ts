// SPDX-License-Identifier: MIT
// Staking flows shared by the lobby (PvP) and the house screen: the same calls the arena screen made before,
// moved into one hook so both screens use them unchanged.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useAccount } from './account';
import { chainChanged, reader, useConfig, useHouses, useOpen } from './data';
import { loadDeck, validateDeck } from './deck';
import { cancel, challenge, fight, type Step } from '../lib/play';

export function useMatchmaking() {
  const navigate = useNavigate();
  const signer = useAccount((s) => s.signer);
  const me = useAccount((s) => s.device?.accountId ?? null);
  const balance = useAccount((s) => s.balance);
  const config = useConfig();
  const houses = useHouses();
  const open = useOpen();
  const [tier, setTier] = useState(0);
  const [format, setFormat] = useState<0 | 1>(1);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [steps, setSteps] = useState<Step[]>([]);
  const [waiting, setWaiting] = useState<string | null>(() => localStorage.getItem('mempire:near:waiting'));
  const deck = loadDeck(me);
  const deckError = validateDeck(deck);
  const stakes = config.data?.tier_stakes;
  const stake = stakes?.[tier];
  const log = (s: Step) => setSteps((x) => [...x, s]);

  useEffect(() => {
    if (!waiting) return;
    const t = setInterval(async () => {
      try {
        const m = await reader.match(waiting);
        if (m?.state === 2) { localStorage.removeItem('mempire:near:waiting'); navigate(`/app/battle/${waiting}`); }
        if (!m || m.state === 4) { localStorage.removeItem('mempire:near:waiting'); setWaiting(null); }
      } catch (e) { setError((e as Error).message); }
    }, 2000);
    return () => clearInterval(t);
  }, [waiting, navigate]);

  /** Balance covers the amount plus 0.01 NEAR of gas. */
  const enough = (amount?: string) => balance !== null && amount !== undefined && balance >= BigInt(amount) + 10n ** 22n;

  async function onFight() {
    if (!signer || !stake) return;
    setError(''); setSteps([]); setBusy('Adding a session key');
    try {
      const r = await fight(signer, tier, format, deck, stake, (s) => { log(s); setBusy('Staking'); });
      chainChanged();
      if (r.active) navigate(`/app/battle/${r.id}`);
      else { localStorage.setItem('mempire:near:waiting', r.id); setWaiting(r.id); }
    } catch (e) { setError((e as Error).message); } finally { setBusy(''); }
  }
  async function onChallenge(index: number, houseStake: string) {
    if (!signer) return;
    setError(''); setSteps([]); setBusy(`Challenging ${houses.data?.[index].name}`);
    try {
      const id = await challenge(signer, index, format, deck, houseStake, log);
      chainChanged();
      navigate(`/app/battle/${id}`);
    } catch (e) { setError((e as Error).message); } finally { setBusy(''); }
  }
  async function onCancel() {
    if (!signer || !waiting) return;
    setBusy('Cancelling');
    try { await cancel(signer, waiting, log); localStorage.removeItem('mempire:near:waiting'); setWaiting(null); chainChanged(); }
    catch (e) { setError((e as Error).message); } finally { setBusy(''); }
  }

  const waitingHere = open.data?.[tier * 2 + format];
  return {
    signer, me, balance, config, houses, open, tier, setTier, format, setFormat, busy, error, steps, waiting, waitingHere,
    deck, deckError, stakes, stake, enough, onFight, onChallenge, onCancel,
  };
}
export type Matchmaking = ReturnType<typeof useMatchmaking>;
