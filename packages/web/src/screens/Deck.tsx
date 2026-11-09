import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { roster } from '@mempire/sdk';
import { formatUnits } from 'viem';
import { useWallet } from '../state/wallet';
import { eligibleSet, useHoldings } from '../state/data';
import { loadDeck, saveDeck, validateDeck } from '../state/deck';
import { CLASS_NAMES, characterOf, minHoldLabel } from '../lib/fighters';
import { statFor, useMarket } from '../state/market';
import { FighterCard, Loading, StateBox } from '../ui/kit';

export function DeckScreen() {
  const wallet = useWallet();
  const address = wallet.data?.address;
  const holdings = useHoldings(address);
  const market = useMarket();
  const [deck, setDeck] = useState<number[]>([]);
  const [saved, setSaved] = useState<number[]>([]);
  useEffect(() => { if (address) { const d = loadDeck(address); setDeck(d); setSaved(d); } }, [address]);
  const eligible = eligibleSet(holdings.data);
  const error = validateDeck(deck, eligible);
  const dirty = deck.join() !== saved.join();

  const toggle = (id: number) => setDeck((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length < 8 ? [...cur, id] : cur));
  const save = () => { if (address && !error) { saveDeck(address, deck); setSaved([...deck]); } };

  const house = roster.fighters.filter((f) => f.kind === 'house');
  // Held fighters first, then the rest by today's stat change.
  const priced = roster.fighters.filter((f) => f.kind !== 'house')
    .sort((a, b) => Number(eligible.has(b.fighterId)) - Number(eligible.has(a.fighterId)) || (statFor(market.byId, b.fighterId) ?? 0) - (statFor(market.byId, a.fighterId) ?? 0));
  const heldCount = priced.filter((f) => eligible.has(f.fighterId)).length;
  const buffed = deck.filter((id) => (statFor(market.byId, id) ?? 0) > 0).length;

  return (
    <div className="section stack" style={{ gap: 18 }}>
      <section className="panel panel--glow stack" aria-labelledby="deck-title">
        <div className="panel-head">
          <div>
            <h1 id="deck-title" className="display h2 ivory">Your deck</h1>
            <p className="fine">Eight fighters. Tap one below to add it, tap a slot to take it out.</p>
          </div>
          <button className="key key--sm" disabled={!address || !!error || !dirty} onClick={save}>{dirty ? 'Save deck' : 'Saved'}</button>
        </div>
        {!address ? (
          <StateBox art title="Connect a wallet first">Your fighters are what your wallet holds. <Link to="/#wallet">Connect in the Arena</Link>.</StateBox>
        ) : (
          <>
            <div className="deck-slots">
              {Array.from({ length: 8 }, (_, i) => deck[i] !== undefined
                ? <FighterCard key={i} id={deck[i]} size="sm" onClick={() => toggle(deck[i])} label={`Remove ${roster.fighters[deck[i]].ticker}`}
                  statBps={statFor(market.byId, deck[i])} pulse={market.byId.get(deck[i])?.state}
                  locked={!holdings.loading && roster.fighters[deck[i]].kind !== 'house' && !eligible.has(deck[i])} lockText="Not held" />
                : <div key={i} className="slot-empty">Empty</div>)}
            </div>
            <div className="row between">
              <span className="chip chip--gold">{deck.length} / 8</span>
              {market.list.length > 0 && <span className={`chip ${buffed ? 'chip--jade' : ''}`}>{buffed} buffed by today&apos;s market</span>}
            </div>
            {error && deck.length > 0 && !holdings.loading && <p className="fine" role="status" style={{ color: '#ff9cb0' }}>{error}</p>}
          </>
        )}
      </section>

      <section className="stack" aria-labelledby="stocks-title">
        <div className="panel-head">
          <h2 id="stocks-title" className="display h3 ivory">Stock Tokens and Ether</h2>
          {address && !holdings.loading && !holdings.error && <span className="chip chip--jade">You can field {heldCount} of {priced.length}</span>}
        </div>
        {address && !holdings.loading && !holdings.error && <div className="progress" aria-hidden><i style={{ width: `${(heldCount / priced.length) * 100}%` }} /></div>}
        <p className="fine">Hold the amount shown and the card lights up: the arena checks <span className="mono">balanceOf</span> when you stake and never moves your tokens. The chip is the stat change today&apos;s Chainlink move would give it; a buff earns the gold epic frame.</p>
        {holdings.loading && address ? <Loading label="Reading your Stock Token balances" lines={2} />
          : holdings.error && address ? <StateBox kind="error" title="Balances unavailable">{holdings.error}</StateBox> : null}
        <ul className="card-grid">
          {priced.map((f) => {
            const h = holdings.data?.find((x) => x.fighterId === f.fighterId);
            const can = eligible.has(f.fighterId);
            const picked = deck.includes(f.fighterId);
            return (
              <li key={f.fighterId}>
                <FighterCard id={f.fighterId} size="md" picked={picked} locked={!!address && !holdings.loading && !can} lockText={`Hold ${minHoldLabel(f)}`}
                  statBps={statFor(market.byId, f.fighterId)} pulse={market.byId.get(f.fighterId)?.state}
                  disabled={!address || (!can && !picked) || (!picked && deck.length >= 8)} showName
                  onClick={() => toggle(f.fighterId)} label={`${f.ticker}, ${characterOf(f.fighterId)}, ${CLASS_NAMES[f.archetype]}${picked ? ', in deck' : ''}${can ? '' : `, needs ${minHoldLabel(f)}`}`} />
                <div className="card-meta">{CLASS_NAMES[f.archetype]} · {h && can ? <b>You hold {Number(formatUnits(h.balance, 18)).toLocaleString('en-US', { maximumFractionDigits: 4 })}</b> : `needs ${minHoldLabel(f)}`}</div>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="stack" aria-labelledby="house-title">
        <h2 id="house-title" className="display h3 ivory">House fighters</h2>
        <p className="fine">Always yours with a $WIF stake. No price feed, so they never get buffed or nerfed.</p>
        <ul className="card-grid">
          {house.map((f) => {
            const picked = deck.includes(f.fighterId);
            return (
              <li key={f.fighterId}>
                <FighterCard id={f.fighterId} size="md" picked={picked} disabled={!address || (!picked && deck.length >= 8)} onClick={() => toggle(f.fighterId)}
                  label={`${f.name}, ${CLASS_NAMES[f.archetype]}${picked ? ', in deck' : ''}`} />
                <div className="card-meta">{CLASS_NAMES[f.archetype]} · free with a stake</div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
