// SPDX-License-Identifier: MIT
// The card collection and one card's page. Every number is the sim's own (level 1, trait folded in) and the market
// change is the relayer price the arena holds right now; nothing here is a guess.
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { roster } from '@mempire/sdk';
import { useAccount } from '../state/account';
import { loadDeck, saveDeck } from '../state/deck';
import { PULSE_LABEL, statFor, useMarket } from '../state/market';
import { CLASS_BLURB, CLASS_NAMES, artOf, characterOf, fighter, pct, rarityOf, shortError, statsOf } from '../lib/fighters';
import { Art, FighterCard, Icon, MoveChip, StateBox, type IconName } from '../ui/kit';
import { ago, money } from '../ui/market';

type Filter = 'all' | 'market' | 'house';
const FILTERS: { id: Filter; label: string }[] = [{ id: 'all', label: 'All' }, { id: 'market', label: 'Market' }, { id: 'house', label: 'House' }];
const RARITY_NAME = { common: 'Common', rare: 'Rare', epic: 'Epic' } as const;

export function Cards() {
  const me = useAccount((s) => s.device?.accountId ?? null);
  const market = useMarket();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>('all');
  const [cls, setCls] = useState<number | null>(null);
  const deck = loadDeck(me);
  const list = roster.fighters
    .filter((f) => (filter === 'all' ? true : f.kind === filter))
    .filter((f) => (cls === null ? true : f.archetype === cls));
  return (
    <div className="screen">
      <header className="screen-head cards-head">
        <div>
          <p className="eyebrow">Card collection</p>
          <h1 className="h1">{roster.fighters.length} fighters</h1>
          <p className="lede">Tap a card to see what it does in battle. Market fighters get stronger or weaker with their real 24 h price move.</p>
        </div>
        <div className="cards-tools">
          <div className="seg" role="group" aria-label="Show">
            {FILTERS.map((f) => <button key={f.id} aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>{f.label}</button>)}
          </div>
          <div className="class-chips" role="group" aria-label="Class">
            <button className="chip chip--btn" aria-pressed={cls === null} onClick={() => setCls(null)}>Every class</button>
            {CLASS_NAMES.map((n, i) => <button key={n} className="chip chip--btn" aria-pressed={cls === i} onClick={() => setCls(cls === i ? null : i)}>{n}</button>)}
          </div>
        </div>
      </header>
      {market.error && !market.list.length && <StateBox kind="error" title="Prices unavailable">{shortError(market.error)} Cards still show their base numbers.</StateBox>}
      <ul className="collection">
        {list.map((f) => {
          const bps = f.kind === 'market' ? statFor(market.byId, f.fighterId) : undefined;
          const inDeck = deck.includes(f.fighterId);
          return (
            <li key={f.fighterId} className="coll-item">
              <FighterCard id={f.fighterId} size="md" statBps={bps} pulse={market.byId.get(f.fighterId)?.state} picked={inDeck}
                onClick={() => navigate(`/app/cards/${f.ticker.toLowerCase()}`)} label={`${f.ticker}, ${characterOf(f.fighterId)}: open card${inDeck ? ', in your deck' : ''}`} />
              <div className="coll-meta"><b>{CLASS_NAMES[f.archetype]}</b><span>{inDeck ? 'In deck' : f.kind === 'house' ? 'House' : 'Market'}</span></div>
            </li>
          );
        })}
      </ul>
      {!list.length && <StateBox title="No fighter matches">Clear the class filter to see all {roster.fighters.length}.</StateBox>}
      <div className="rarity-key card card--note">
        <span><i className="sw sw--common" />Common: house fighter</span>
        <span><i className="sw sw--rare" />Rare: market fighter</span>
        <span><i className="sw sw--epic" />Epic: buffed by today&apos;s move</span>
        <Link to="/app/deck" className="link-strong">Build your deck <Icon name="arrow" size={16} /></Link>
      </div>
    </div>
  );
}

function Stat({ k, v, base, unit, icon }: { k: string; v: string | null; base?: string | null; unit?: string; icon: IconName }) {
  if (v === null) return null;
  const changed = base != null && base !== v;
  return (
    <div className="cstat">
      <span className="cstat-ico" aria-hidden><Icon name={icon} size={18} /></span>
      <span className="cstat-k">{k}</span>
      <b className="cstat-v num">{v}{unit && <small>{unit}</small>}</b>
      {changed && <span className="cstat-base num">base {base}</span>}
    </div>
  );
}

export function CardDetail() {
  const { ticker = '' } = useParams();
  const navigate = useNavigate();
  const me = useAccount((s) => s.device?.accountId ?? null);
  const market = useMarket();
  const f = roster.fighters.find((x) => x.ticker.toLowerCase() === ticker.toLowerCase());
  const [deck, setDeck] = useState<number[]>(() => loadDeck(me));
  const [swapping, setSwapping] = useState(false);
  if (!f) return <div className="screen"><StateBox title="No such fighter" action={<Link className="btn btn--blue btn--sm" to="/app/cards">All cards</Link>}>There is no fighter called {ticker}.</StateBox></div>;
  const id = f.fighterId;
  const p = market.byId.get(id);
  const bps = f.kind === 'market' ? (p?.statBps ?? 0) : 0;
  const s = statsOf(id, bps);
  const rarity = rarityOf(id, f.kind === 'market' ? p?.statBps ?? null : null);
  const inDeck = deck.includes(id);
  const idx = roster.fighters.indexOf(f);
  const prev = roster.fighters[(idx + roster.fighters.length - 1) % roster.fighters.length];
  const next = roster.fighters[(idx + 1) % roster.fighters.length];
  const write = (d: number[]) => { saveDeck(me, d); setDeck(d); setSwapping(false); };
  const toggle = () => {
    if (inDeck) { if (deck.length > 1) write(deck.filter((x) => x !== id)); return; }
    if (deck.length < 8) write([...deck, id]); else setSwapping(true);
  };
  const fmt = (n: number | null, d = 0) => (n === null ? null : n.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d }));
  return (
    <div className="screen">
      <nav className="crumbs" aria-label="Breadcrumb"><Link to="/app/cards"><Icon name="chevL" size={16} />All cards</Link></nav>
      <section className={`cdetail cdetail--${rarity}`} aria-labelledby="cd-title">
        <div className="cdetail-stage">
          <span className="cdetail-rays" aria-hidden />
          <Art className="cdetail-art" src={artOf(id)} eager fallback={<span className="fighter-ph">{f.ticker[0]}</span>} />
          <span className="cdetail-cost" aria-label={`Costs ${s.elixir} elixir`}><b>{s.elixir}</b></span>
          <span className={`cdetail-rarity rar--${rarity}`}>{RARITY_NAME[rarity]}</span>
          <div className="cdetail-nav">
            <button className="btn btn--white btn--icon" onClick={() => navigate(`/app/cards/${prev.ticker.toLowerCase()}`)} aria-label={`Previous: ${prev.ticker}`}><Icon name="chevL" /></button>
            <button className="btn btn--white btn--icon" onClick={() => navigate(`/app/cards/${next.ticker.toLowerCase()}`)} aria-label={`Next: ${next.ticker}`}><Icon name="chevR" /></button>
          </div>
        </div>
        <div className="cdetail-body">
          <div className="cdetail-title">
            <span className="chip chip--gold">{f.ticker}</span>
            <span className="chip">{CLASS_NAMES[f.archetype]}</span>
            <span className="chip chip--sky">{f.kind === 'house' ? 'House fighter' : 'Market fighter'}</span>
          </div>
          <h1 id="cd-title" className="h1 cdetail-name">{characterOf(id)}</h1>
          <p className="lede">{CLASS_BLURB[f.archetype]}</p>
          {f.archetype !== 5 && <p className="trait"><b>Trait · {s.trait.name}.</b> {s.trait.blurb}</p>}

          <div className="cstats" aria-label="Battle numbers at level 1">
            <Stat k="Hit points" icon="shield" v={fmt(s.hp)} base={fmt(s.baseHp)} />
            <Stat k={f.archetype === 5 ? 'Blast damage' : 'Damage per hit'} icon="swords" v={fmt(s.damage)} base={fmt(s.baseDamage)} />
            <Stat k="Hits every" icon="clock" v={fmt(s.hitSpeed, 1)} unit="s" />
            <Stat k="Range" icon="arrow" v={fmt(s.range, 1)} unit="tiles" />
            <Stat k="Speed" icon="bolt" v={fmt(s.speed, 2)} unit="tiles/s" />
            <Stat k="Fighters per drop" icon="user" v={s.count > 1 ? String(s.count) : null} />
            <Stat k={f.archetype === 5 ? 'Blast radius' : 'Splash radius'} icon="flame" v={fmt(s.splash, 1)} unit="tiles" />
            <Stat k="Speed-up aura" icon="up" v={fmt(s.aura, 1)} unit="tiles" />
            <Stat k="Lands after" icon="clock" v={fmt(s.delay, 1)} unit="s" />
          </div>

          <div className={`cmarket${f.kind === 'house' ? ' cmarket--house' : ''}`}>
            {f.kind === 'house' ? (
              <p className="fine"><b>No price.</b> House fighters are never buffed or nerfed, so their numbers above never change.</p>
            ) : !p ? (
              <p className="fine" role="status">{market.loading ? 'Reading the signed price from the arena…' : market.error ? `Price unavailable: ${shortError(market.error, 120)}` : 'No signed price stored yet: this fighter plays neutral.'}</p>
            ) : (
              <>
                <div className="cmarket-row">
                  <div><span className="label">{f.ticker} price</span><b className="num">{p.price !== null ? money(p.price) : '—'}</b></div>
                  <div><span className="label">24 h move</span><b className={`num ${p.moveBps != null && p.moveBps >= 0 ? 'up' : 'down'}`}>{p.moveBps != null ? pct(p.moveBps, 2) : '—'}</b></div>
                  <div><span className="label">In battle</span><MoveChip statBps={p.statBps} state={p.state} /></div>
                </div>
                <p className="fine">{PULSE_LABEL[p.state]} · relayer price (testnet), posted {p.updatedAt ? ago(p.updatedAt) : '—'}. At kick-off the arena stores twice the 24 h move, capped at ±15%, as this card&apos;s hit-point and damage change{p.state !== 'live' ? '; a stale or missing price plays neutral' : ''}.</p>
              </>
            )}
          </div>

          <div className="cdetail-cta">
            <button className={`btn ${inDeck ? 'btn--white' : 'btn--green'} btn--lg`} onClick={toggle} disabled={inDeck && deck.length <= 1}>
              <Icon name={inDeck ? 'x' : 'cards'} size={20} />{inDeck ? 'Remove from deck' : 'Add to deck'}
            </button>
            <Link className="btn btn--blue btn--lg" to="/app/practice">Try it in practice <Icon name="arrow" size={20} /></Link>
          </div>
          {swapping && (
            <div className="swap" role="dialog" aria-label="Your deck is full: pick a card to swap out">
              <p className="fine"><b>Your deck is full.</b> Tap the card {f.ticker} should replace.</p>
              <div className="deck-grid deck-grid--8">
                {deck.map((d) => <FighterCard key={d} id={d} size="sm" onClick={() => write(deck.map((x) => (x === d ? id : x)))} label={`Swap out ${fighter(d).ticker}`} />)}
              </div>
              <button className="btn btn--white btn--sm" onClick={() => setSwapping(false)}>Keep my deck</button>
            </div>
          )}
          <p className="fine">Your deck is saved in this browser and sent with your stake when a match starts.</p>
        </div>
      </section>
    </div>
  );
}
