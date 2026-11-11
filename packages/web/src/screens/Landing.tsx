// SPDX-License-Identifier: MIT
import { useRef, useState } from 'react';
import { Link } from 'react-router';
import { formatNear, roster, TIER_NAMES } from '@mempire/sdk';
import { net, deploymentInfo, accountUrl } from '../lib/net';
import { useConfig, useHouses, useRecent, useSeason, useTotals } from '../state/data';
import { useMarket } from '../state/market';
import { CLASS_NAMES, HOUSE_LEVEL, TIER_BADGES, characterOf, costOf, pct, shortAcct, shortError } from '../lib/fighters';
import { ART, badgeArt, houseArt, OBJ3D } from '../lib/art';
import { Art, Avatar, BrandMark, Countdown, FighterCard, Icon, Loading, MoveChip, StateBox, Logo } from '../ui/kit';
import { MarketTicker, money } from '../ui/market';
import { MatchCard, PotSplit } from './Proof';

function Num({ value, loading, error }: { value?: string; loading: boolean; error: string | null }) {
  if (loading) return <span className="lx-skel" aria-label="Loading" />;
  if (error) return <span title={error}>n/a</span>;
  return <>{value}</>;
}

/** Key art: portrait on phones and landscape elsewhere; a phone falls back to the landscape file, then to a drawn sky. */
function KeyArt() {
  const [stage, setStage] = useState<'both' | 'landscape' | 'none'>('both');
  if (stage === 'none') return <div className="lx-hero-ph" aria-hidden><i /><i /><i /></div>;
  const phone = typeof window !== 'undefined' && window.matchMedia('(max-width: 760px)').matches;
  return (
    <picture key={stage}>
      {stage === 'both' && <source media="(max-width: 760px)" srcSet={ART.keyartPortrait} />}
      <img className={`lx-hero-art${stage === 'landscape' && phone ? ' lx-hero-art--wide' : ''}`} src={ART.keyart} alt="" aria-hidden fetchPriority="high"
        onError={() => setStage((s) => (s === 'both' && phone ? 'landscape' : 'none'))} />
    </picture>
  );
}

function Nav() {
  return (
    <nav className="lx-nav" aria-label="Site">
      <Link to="/" className="lx-brand"><BrandMark size={44} /><span>Mempire</span></Link>
      <div className="lx-nav-links">
        <a href="#fighters">Fighters</a>
        <a href="#how">How it works</a>
        <a href="#proof">Proof</a>
        <a href="#seasons">Seasons</a>
        <a href="#near">NEAR</a>
      </div>
      <Link className="btn btn--gold btn--sm lx-nav-play" to="/app">Play</Link>
    </nav>
  );
}

function Hero() {
  const totals = useTotals();
  const season = useSeason();
  return (
    <header className="lx-hero">
      <KeyArt />
      <div className="lx-hero-shade" aria-hidden />
      <Nav />
      <div className="lx-hero-body">
        <span className="lx-logo"><Logo /></span>
        <p className="lx-badge"><span className="dot" aria-hidden />Real-time 1v1 lane battler · NEAR testnet</p>
        <h1 className="lx-h1">Your fighters are live markets.<br /><span>The chain is the referee.</span></h1>
        <div className="lx-ctas">
          <Link className="btn btn--green lx-play" to="/app"><Icon name="play" size={30} />Play</Link>
          <Link className="btn btn--white" to="/app/practice">Practice free</Link>
        </div>
        <dl className="lx-stats" aria-label="Live from the arena contract">
          <div><dt>Refereed on-chain</dt><dd><Num value={totals.data?.settled} loading={totals.loading} error={totals.error} /></dd></div>
          <div><dt>Ticks replayed</dt><dd><Num value={totals.data ? Number(totals.data.refereed_ticks).toLocaleString('en-US') : undefined} loading={totals.loading} error={totals.error} /></dd></div>
          <div><dt>Season {season.data?.current ?? ''} pool</dt><dd><Num value={season.data ? `${formatNear(season.data.info.pool)} Ⓝ` : undefined} loading={season.loading} error={season.error} /></dd></div>
          <div><dt>Season ends</dt><dd>{season.data ? <Countdown to={Number(season.data.info.end_ms) / 1000} /> : <Num loading={season.loading} error={season.error} />}</dd></div>
        </dl>
      </div>
    </header>
  );
}

/** The roster: market fighters first (live price and 24 h move), then the house fighters. */
function Roster() {
  const market = useMarket();
  const row = useRef<HTMLUListElement>(null);
  const fighters = [...roster.fighters].sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'market' ? -1 : 1));
  const scroll = (dir: number) => row.current?.scrollBy({ left: dir * Math.min(640, row.current.clientWidth * 0.8), behavior: 'smooth' });
  return (
    <section className="lx-section lx-roster" id="fighters" aria-labelledby="fighters-title">
      <div className="lx-head lx-head--row">
        <div>
          <p className="lx-eyebrow">The roster</p>
          <h2 id="fighters-title" className="lx-h2">Today&apos;s move becomes tomorrow&apos;s hit points.</h2>
          <p className="lx-sub">Each market fighter is a live ticker. At kick-off the arena stores twice its 24 h move as a hit-point and damage change, capped at ±15%. Prices are a relayer price (testnet): Coinbase 24 h stats signed with a key the contract checks.</p>
        </div>
        <div className="lx-arrows">
          <button className="btn btn--white btn--icon" onClick={() => scroll(-1)} aria-label="Previous fighters"><Icon name="chevL" /></button>
          <button className="btn btn--white btn--icon" onClick={() => scroll(1)} aria-label="Next fighters"><Icon name="chevR" /></button>
        </div>
      </div>
      <ul className="lx-carousel" ref={row}>
        {fighters.map((f) => {
          const p = market.byId.get(f.fighterId);
          const isMarket = f.kind === 'market';
          return (
            <li key={f.fighterId} className={`lx-fighter${isMarket ? ' lx-fighter--market' : ''}`}>
              <FighterCard id={f.fighterId} size="lg" statBps={isMarket ? (p ? p.statBps : null) : undefined} pulse={p?.state} />
              <div className="lx-fighter-body">
                <div className="lx-fighter-top"><b>{f.ticker}</b>{isMarket ? <MoveChip statBps={p ? p.statBps : null} state={p?.state} small /> : <span className="chip">House</span>}</div>
                <span className="lx-fighter-name">{characterOf(f.fighterId)} · {CLASS_NAMES[f.archetype]} · {costOf(f.fighterId)} elixir</span>
                <span className="lx-fighter-px num">
                  {!isMarket ? 'No price: always neutral'
                    : p?.price != null ? <>{money(p.price)}{p.moveBps != null && <> · <span className={p.moveBps >= 0 ? 'up' : 'down'}>{pct(p.moveBps, 2)}</span> 24 h</>}</>
                      : market.loading ? 'Reading price…' : market.error ? 'Price unavailable' : 'No price yet'}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const STEPS = [
  { n: 1, title: 'Pick a stake, get a session key', icon: 'key' as const, tone: 'gold', body: 'Your account adds a function-call key that can only call the arena\'s play, with a 0.25 NEAR gas allowance. No pop-ups during the match, and it cannot move funds.', code: 'AddKey FunctionCall { methods: ["play"] }' },
  { n: 2, title: 'Drop fighters in real time', icon: 'swords' as const, tone: 'sky', body: 'Two lanes, three towers a side, three minutes or a 30-second rush. Every card drop is a play transaction the arena stores with its tick; late drops are refused.', code: 'play(id, tick, deck_index, x, y)' },
  { n: 3, title: 'The contract replays and pays', icon: 'shield' as const, tone: 'grass', body: 'settle runs a Rust port of the same sim over the stored log and pays whoever the replay says won: 92% to the winner. A claim that disagrees is rejected.', code: 'settle(id, claim?) → winner, state hash' },
];

function HowItWorks() {
  return (
    <section className="lx-section" id="how" aria-labelledby="how-title">
      <div className="lx-head lx-head--center">
        <p className="lx-eyebrow">How a match works</p>
        <h2 id="how-title" className="lx-h2">Three steps. No trusted server.</h2>
      </div>
      <ol className="lx-steps">
        {STEPS.map((s) => (
          <li key={s.n} className={`lx-step lx-step--${s.tone}`}>
            <span className="lx-step-n">{s.n}</span>
            <span className="lx-step-ico"><Icon name={s.icon} size={30} /></span>
            <h3 className="lx-h3">{s.title}</h3>
            <p>{s.body}</p>
            <code className="lx-code">{s.code}</code>
          </li>
        ))}
      </ol>
      <div className="lx-callout">
        <span className="lx-callout-ico" aria-hidden><Icon name="cpu" size={30} /></span>
        <div>
          <p className="lx-callout-big">Match #2 on testnet: 21 plays, 600 ticks, replayed and settled in one call for <b>22.3 TGas</b>.</p>
          <p className="lx-sub">Under a tenth of a call&apos;s 300 TGas. Longer matches checkpoint the sim state and resume in the next call; a fake winner claim was rejected on testnet.</p>
        </div>
      </div>
    </section>
  );
}

function LiveProof() {
  const recent = useRecent(6);
  const totals = useTotals();
  const t = totals.data;
  return (
    <section className="lx-section lx-band lx-band--grass" id="proof" aria-labelledby="live-title">
      <div className="lx-inner">
        <div className="lx-head lx-head--row">
          <div>
            <p className="lx-eyebrow lx-eyebrow--light">Live on-chain proof</p>
            <h2 id="live-title" className="lx-h2 lx-h2--light">Every result here was decided by the contract.</h2>
            <p className="lx-sub lx-sub--light">Read straight from <a href={accountUrl(net.arena)} target="_blank" rel="noreferrer" className="mono">{net.arena}</a>. Open a match to replay it in your browser and compare the state hash.</p>
          </div>
          <Link className="btn btn--white" to="/app/proof">All proof <Icon name="arrow" size={18} /></Link>
        </div>
        <div className="lx-proof">
          <div className="lx-bignums">
            <div><span className="lx-big"><Num value={t?.matches} loading={totals.loading} error={totals.error} /></span><span className="lx-cap">matches staked</span></div>
            <div><span className="lx-big"><Num value={t?.settled} loading={totals.loading} error={totals.error} /></span><span className="lx-cap">refereed on-chain</span></div>
            <div><span className="lx-big"><Num value={t ? `${formatNear(t.volume)}` : undefined} loading={totals.loading} error={totals.error} /></span><span className="lx-cap">NEAR in pots</span></div>
            <div><span className="lx-big"><Num value={t ? formatNear(t.season_paid) : undefined} loading={totals.loading} error={totals.error} /></span><span className="lx-cap">NEAR paid to seasons</span></div>
          </div>
          <div className="lx-matches card">
            <div className="card-head"><h3 className="h3">Recent matches</h3><span className="chip chip--live">live</span></div>
            {recent.loading ? <Loading label="Loading matches" lines={4} /> : recent.error ? <StateBox kind="error" title="Matches unavailable">{shortError(recent.error, 120)}</StateBox>
              : !recent.data!.length ? <StateBox art title="No matches yet">The first staked match will appear here.</StateBox>
                : <ul className="mlist">{recent.data!.map((m) => <MatchCard key={m.id} m={m} />)}</ul>}
            <PotSplit />
          </div>
        </div>
      </div>
    </section>
  );
}

function SeasonsHouses() {
  const season = useSeason();
  const houses = useHouses();
  const config = useConfig();
  const info = season.data?.info;
  return (
    <section className="lx-section" id="seasons" aria-labelledby="seasons-title">
      <div className="lx-head lx-head--center">
        <p className="lx-eyebrow">Seasons and houses</p>
        <h2 id="seasons-title" className="lx-h2">Climb the season. Raid a house.</h2>
      </div>
      <div className="lx-sh">
        <article className="lx-season">
          <Art className="lx-season-art" src={OBJ3D.trophy} fallback={<Icon name="trophy" size={80} />} />
          <h3 className="lx-season-title">Season {season.data?.current ?? '…'}</h3>
          <p className="lx-season-sub">3% of every pot funds the pool. The first settle of a new season pays the top three 50 / 30 / 20.</p>
          <div className="lx-season-nums">
            <div><span className="label">Pool</span><b className="num">{info ? `${formatNear(info.pool)} Ⓝ` : season.error ? 'n/a' : '…'}</b></div>
            <div><span className="label">Ends in</span><b className="num">{info ? <Countdown to={Number(info.end_ms) / 1000} /> : season.error ? 'n/a' : '…'}</b></div>
          </div>
          <ol className="lx-top3">
            {[0, 1, 2].map((i) => {
              const t = info?.top[i];
              return <li key={i}><span className="lx-rank" data-rank={i + 1}>{i + 1}</span><span className="lx-top3-name">{t ? shortAcct(t.account) : 'Open seat'}</span><b className="num">{t ? `${t.points} pts` : '—'}</b></li>;
            })}
          </ol>
          <ul className="lx-tiers" aria-label="Stake tiers">
            {TIER_NAMES.map((name, i) => (
              <li key={name}>
                <Art className="lx-tier-badge" src={badgeArt(TIER_BADGES[i])} fallback={<span className="tier-badge-ph">{name[0]}</span>} />
                <b>{name}</b>
                <span className="num">{config.data ? `${formatNear(config.data.tier_stakes[i])} Ⓝ` : '…'}</span>
              </li>
            ))}
          </ul>
        </article>
        <div className="lx-houses">
          {houses.loading ? <div className="card"><Loading label="Loading houses" lines={3} /></div>
            : houses.error ? <StateBox kind="error" title="Houses unavailable">{shortError(houses.error, 120)}</StateBox>
              : houses.data!.map((h) => {
                const art = houseArt(h.name);
                return (
                  <article key={h.index} className={`lx-house lx-house--${h.difficulty}`}>
                    <div className="lx-house-art">{art ? <Art src={art} className="lx-house-img" fallback={<Avatar id={h.deck[0]} size={84} />} /> : <Avatar id={h.deck[0]} size={84} />}</div>
                    <div className="lx-house-body">
                      <div className="lx-house-top"><h3 className="lx-house-name">{h.name}</h3><span className="chip">{HOUSE_LEVEL[h.difficulty]}</span></div>
                      <a className="mono lx-acct" href={accountUrl(h.account)} target="_blank" rel="noreferrer">{h.account}</a>
                      <dl>
                        <div><dt>Record</dt><dd className="num">{h.wins}–{h.losses}–{h.draws}</dd></div>
                        <div><dt>Treasury</dt><dd className="num">{formatNear(h.treasury, 3)} Ⓝ</dd></div>
                        <div><dt>Stake</dt><dd className="num">{formatNear(h.stake)} Ⓝ</dd></div>
                      </dl>
                    </div>
                  </article>
                );
              })}
          <Link className="btn btn--blue btn--wide" to="/app/houses"><Icon name="castle" size={18} />Challenge a house</Link>
        </div>
      </div>
    </section>
  );
}

const TECH = [
  { k: 'Function-call access keys', icon: 'key' as const, v: 'Per-match session keys limited to play. A sandbox test proves the key cannot stake, settle or transfer.' },
  { k: 'NEP-366 meta transactions', icon: 'layers' as const, v: 'Adding and deleting session keys, settling and cancelling are signed in the browser and paid for by the relayer. Only the stake costs the player gas.' },
  { k: 'Sub-accounts', icon: 'user' as const, v: 'Players are sub-accounts the relayer creates for a key made in the browser; houses and the treasury are sub-accounts of the arena.' },
  { k: 'On-chain ed25519 checks', icon: 'shield' as const, v: 'post_prices checks env::ed25519_verify against the relayer key before a price counts, and refuses stale or tampered snapshots.' },
  { k: 'Deterministic replay in WASM', icon: 'cpu' as const, v: 'The TypeScript sim is ported line for line to Rust; a parity test replays 60 recorded matches and compares the state hash every 40 ticks.' },
  { k: 'Weekly season, paid on-chain', icon: 'trophy' as const, v: '3% of each pot funds the season. The first settle of a new season pays the previous top three 50 / 30 / 20.' },
];

function NearTech() {
  return (
    <section className="lx-section lx-band lx-band--royal" id="near" aria-labelledby="near-title">
      <div className="lx-inner">
        <div className="lx-head lx-head--center">
          <p className="lx-eyebrow lx-eyebrow--light">Built on NEAR</p>
          <h2 id="near-title" className="lx-h2 lx-h2--light">What NEAR does here, concretely.</h2>
        </div>
        <ul className="lx-tech">
          {TECH.map((t) => (
            <li key={t.k}><span className="lx-tech-ico"><Icon name={t.icon} size={24} /></span><h3>{t.k}</h3><p>{t.v}</p></li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function Landing() {
  return (
    <div className="lx">
      <Hero />
      <MarketTicker />
      <main>
        <Roster />
        <HowItWorks />
        <LiveProof />
        <SeasonsHouses />
        <NearTech />
        <section className="lx-final" aria-labelledby="final-title" style={{ ['--final-art' as string]: `url(${ART.keyart})` }}>
          <h2 id="final-title" className="lx-final-title">Pick eight. Read the market. Battle.</h2>
          <div className="lx-ctas"><Link className="btn btn--green lx-play" to="/app"><Icon name="play" size={30} />Play</Link><Link className="btn btn--white" to="/app/practice">Practice free</Link></div>
        </section>
      </main>
      <footer className="lx-foot">
        <div className="lx-foot-brand"><BrandMark size={36} /><b>Mempire</b></div>
        <nav className="lx-foot-links" aria-label="Footer">
          <Link to="/app">Play</Link><Link to="/app/deck">Deck</Link><Link to="/app/season">Season</Link><Link to="/app/houses">Houses</Link><Link to="/app/proof">Proof</Link>
        </nav>
        <p>NEAR testnet · arena <a className="mono" href={accountUrl(net.arena)} target="_blank" rel="noreferrer">{net.arena}</a> · treasury <span className="mono">{shortAcct(deploymentInfo.treasury)}</span></p>
        <p>Stakes are testnet NEAR. MIT licensed. Original characters and art.</p>
      </footer>
    </div>
  );
}
