// SPDX-License-Identifier: MIT
import { useState } from 'react';
import { roster } from '@mempire/sdk';
import { useAccount } from '../state/account';
import { loadDeck, saveDeck, validateDeck } from '../state/deck';
import { CLASS_NAMES, characterOf, costOf } from '../lib/fighters';
import { PULSE_LABEL, statFor, useMarket } from '../state/market';
import { FighterCard, Icon } from '../ui/kit';

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
  const avg = deck.length ? deck.reduce((a, id) => a + costOf(id), 0) / deck.length : 0;
  const card = (id: number) => {
    const f = roster.fighters[id];
    const picked = deck.includes(id);
    const p = market.byId.get(id);
    return (
      <li key={id} className="pick">
        <FighterCard id={id} size="md" picked={picked} statBps={f.kind === 'market' ? statFor(market.byId, id) : undefined} pulse={p?.state}
          disabled={!picked && deck.length >= 8} onClick={() => toggle(id)}
          label={`${f.ticker}, ${characterOf(id)}, ${CLASS_NAMES[f.archetype]}${picked ? ', in deck' : ''}`} />
        <div className="card-meta"><b>{CLASS_NAMES[f.archetype]}</b> · {f.kind === 'house' ? 'always neutral' : p ? PULSE_LABEL[p.state] : 'reading…'}</div>
      </li>
    );
  };
  return (
    <div className="screen">
      <section className="deckbar card card--gold" aria-labelledby="deck-title">
        <div className="deckbar-head">
          <div>
            <h1 id="deck-title" className="h2">Your battle deck</h1>
            <p className="fine">Eight fighters. Tap a card below to add it, tap a slot to take it out. Saved in this browser.</p>
          </div>
          <button className="btn btn--green" disabled={!!error || !dirty} onClick={save}><Icon name="check" size={18} />{dirty ? 'Save deck' : 'Saved'}</button>
        </div>
        <div className="deck-grid deck-grid--8">
          {Array.from({ length: 8 }, (_, i) => deck[i] !== undefined
            ? <FighterCard key={i} id={deck[i]} size="sm" onClick={() => toggle(deck[i])} label={`Remove ${roster.fighters[deck[i]].ticker}`}
              statBps={roster.fighters[deck[i]].kind === 'market' ? statFor(market.byId, deck[i]) : undefined} pulse={market.byId.get(deck[i])?.state} />
            : <div key={i} className="slot-empty"><span>+</span></div>)}
        </div>
        <div className="deck-stats">
          <span className="pill pill--gold">{deck.length} / 8</span>
          <span className="pill pill--elixir"><Icon name="drop" size={14} />{avg.toFixed(1)} avg cost</span>
          {market.list.length > 0 && <span className={`pill${buffed ? ' pill--jade' : ''}`}><Icon name="up" size={14} />{buffed} buffed by today&apos;s market</span>}
        </div>
        {error && deck.length > 0 && <p className="fine warn" role="status">{error}</p>}
      </section>
      <section className="stack" aria-labelledby="market-title">
        <div className="section-title">
          <h2 id="market-title" className="h3">Market fighters</h2>
          <p className="fine">BTC, ETH, NEAR, SOL and ZEC. At kick-off the arena stores twice each one&apos;s 24 h move (priced by OutLayer&apos;s TEE oracle) as its hit-point and damage change, capped at ±15%. A buff earns the epic frame.</p>
        </div>
        <ul className="card-grid">{marketFighters.map((f) => card(f.fighterId))}</ul>
      </section>
      <section className="stack" aria-labelledby="house-title">
        <div className="section-title">
          <h2 id="house-title" className="h3">House fighters</h2>
          <p className="fine">No price, so they are never buffed or nerfed.</p>
        </div>
        <ul className="card-grid">{house.map((f) => card(f.fighterId))}</ul>
      </section>
      <div className="rarity-key card card--note">
        <span><i className="sw sw--common" />Common: house fighter</span>
        <span><i className="sw sw--rare" />Rare: market fighter</span>
        <span><i className="sw sw--epic" />Epic: buffed by today&apos;s move</span>
      </div>
    </div>
  );
}
