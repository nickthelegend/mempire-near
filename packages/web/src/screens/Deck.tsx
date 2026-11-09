// SPDX-License-Identifier: MIT
import { useState } from 'react';
import { roster } from '@mempire/sdk';
import { useAccount } from '../state/account';
import { loadDeck, saveDeck, validateDeck } from '../state/deck';
import { CLASS_NAMES, characterOf } from '../lib/fighters';
import { PULSE_LABEL, statFor, useMarket } from '../state/market';
import { FighterCard } from '../ui/kit';

export function DeckScreen() {
  const me = useAccount((s) => s.device?.accountId ?? null);
  const market = useMarket();
  const [deck, setDeck] = useState<number[]>(() => loadDeck(me));
  const [saved, setSaved] = useState<number[]>(() => loadDeck(me));
  const error = validateDeck(deck);
  const dirty = deck.join() !== saved.join();
  const toggle = (id: number) => setDeck((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length < 8 ? [...cur, id] : cur));
  const save = () => { if (!error) { saveDeck(me, deck); setSaved([...deck]); } };
  const marketFighters = roster.fighters.filter((f) => f.kind === 'market').sort((a, b) => (statFor(market.byId, b.fighterId) ?? 0) - (statFor(market.byId, a.fighterId) ?? 0));
  const house = roster.fighters.filter((f) => f.kind === 'house');
  const buffed = deck.filter((id) => (statFor(market.byId, id) ?? 0) > 0).length;
  const card = (id: number) => {
    const f = roster.fighters[id];
    const picked = deck.includes(id);
    const p = market.byId.get(id);
    return (
      <li key={id}>
        <FighterCard id={id} size="md" picked={picked} statBps={f.kind === 'market' ? statFor(market.byId, id) : undefined} pulse={p?.state}
          disabled={!picked && deck.length >= 8} onClick={() => toggle(id)}
          label={`${f.ticker}, ${characterOf(id)}, ${CLASS_NAMES[f.archetype]}${picked ? ', in deck' : ''}`} />
        <div className="card-meta">{CLASS_NAMES[f.archetype]} · {f.kind === 'house' ? 'always neutral' : p ? PULSE_LABEL[p.state] : 'reading…'}</div>
      </li>
    );
  };
  return (
    <div className="section stack" style={{ gap: 18 }}>
      <section className="panel panel--glow stack" aria-labelledby="deck-title">
        <div className="panel-head">
          <div>
            <h1 id="deck-title" className="display h2 ivory">Your deck</h1>
            <p className="fine">Eight fighters. Tap a card below to add it, tap a slot to take it out. Saved in this browser.</p>
          </div>
          <button className="key key--sm" disabled={!!error || !dirty} onClick={save}>{dirty ? 'Save deck' : 'Saved'}</button>
        </div>
        <div className="deck-slots">
          {Array.from({ length: 8 }, (_, i) => deck[i] !== undefined
            ? <FighterCard key={i} id={deck[i]} size="sm" onClick={() => toggle(deck[i])} label={`Remove ${roster.fighters[deck[i]].ticker}`}
              statBps={roster.fighters[deck[i]].kind === 'market' ? statFor(market.byId, deck[i]) : undefined} pulse={market.byId.get(deck[i])?.state} />
            : <div key={i} className="slot-empty">Empty</div>)}
        </div>
        <div className="row between">
          <span className="chip chip--gold">{deck.length} / 8</span>
          {market.list.length > 0 && <span className={`chip ${buffed ? 'chip--jade' : ''}`}>{buffed} buffed by today&apos;s market</span>}
        </div>
        {error && deck.length > 0 && <p className="fine" role="status" style={{ color: '#ff9cb0' }}>{error}</p>}
      </section>
      <section className="stack" aria-labelledby="market-title">
        <h2 id="market-title" className="display h3 ivory">Market fighters</h2>
        <p className="fine">BTC, ETH, NEAR, SOL and ZEC. At kick-off the arena stores twice each one&apos;s 24 h move (relayer price, testnet) as its hit-point and damage change, capped at ±15%. A buff earns the gold frame.</p>
        <ul className="card-grid">{marketFighters.map((f) => card(f.fighterId))}</ul>
      </section>
      <section className="stack" aria-labelledby="house-title">
        <h2 id="house-title" className="display h3 ivory">House fighters</h2>
        <p className="fine">No price, so they are never buffed or nerfed.</p>
        <ul className="card-grid">{house.map((f) => card(f.fighterId))}</ul>
      </section>
    </div>
  );
}
