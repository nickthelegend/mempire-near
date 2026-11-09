// SPDX-License-Identifier: MIT
import { Link } from 'react-router';
import { formatNear, roster, STATE_NAMES, type MatchView } from '@mempire/sdk';
import { net, deploymentInfo, accountUrl } from '../lib/net';
import { useHouses, useRecent, useSeason, useTotals } from '../state/data';
import { useMarket } from '../state/market';
import { CLASS_NAMES, HOUSE_LEVEL, artOf, characterOf, pct, shortAcct, shortError } from '../lib/fighters';
import { Countdown, Icon, MoveChip } from '../ui/kit';

function Num({ value, loading, error }: { value?: string; loading: boolean; error: string | null }) {
  if (loading) return <span className="lx-skel" aria-label="Loading" />;
  if (error) return <span title={error}>n/a</span>;
  return <>{value}</>;
}

function Hero() {
  const totals = useTotals();
  const season = useSeason();
  return (
    <header className="lx-hero">
      <img className="lx-hero-art" src="/brand/v2/keyart.webp" alt="" aria-hidden fetchPriority="high" />
      <div className="lx-hero-shade" aria-hidden />
      <nav className="lx-nav" aria-label="Site">
        <Link to="/" className="lx-brand"><img src="/brand/v2/logo.webp" width={36} height={36} alt="" aria-hidden />Mempire</Link>
        <div className="lx-nav-links">
          <a href="#referee">Referee</a>
          <a href="#fighters">Fighters</a>
          <a href="#near">NEAR</a>
          <Link className="lx-btn lx-btn--sm" to="/app">Play</Link>
        </div>
      </nav>
      <div className="lx-hero-body">
        <p className="lx-eyebrow">Real-time 1v1 card battler · NEAR testnet</p>
        <h1 className="lx-h1">Your fighters are live markets. <span>The chain is the referee.</span></h1>
        <p className="lx-lede">Drop troops into two lanes in real time. BTC, ETH, NEAR, SOL and ZEC hit harder or softer with their 24 hour move. When the bell rings, a NEAR contract replays every play and pays the winner. Nobody&apos;s claim counts but its own.</p>
        <div className="lx-ctas">
          <Link className="lx-btn" to="/app">Enter the arena <Icon name="arrow" size={18} /></Link>
          <Link className="lx-btn lx-btn--ghost" to="/app/practice">Practice free</Link>
        </div>
        <dl className="lx-ticker" aria-label="Live from the arena contract">
          <div><dt>Refereed on-chain</dt><dd><Num value={totals.data?.settled} loading={totals.loading} error={totals.error} /></dd></div>
          <div><dt>Ticks replayed</dt><dd><Num value={totals.data ? Number(totals.data.refereed_ticks).toLocaleString('en-US') : undefined} loading={totals.loading} error={totals.error} /></dd></div>
          <div><dt>Season {season.data?.current ?? ''} pool</dt><dd><Num value={season.data ? `${formatNear(season.data.info.pool)} Ⓝ` : undefined} loading={season.loading} error={season.error} /></dd></div>
          <div><dt>Season ends</dt><dd>{season.data ? <Countdown to={Number(season.data.info.end_ms) / 1000} /> : <Num loading={season.loading} error={season.error} />}</dd></div>
        </dl>
      </div>
    </header>
  );
}

function resultOf(m: MatchView) {
  if (m.state !== 3) return STATE_NAMES[m.state];
  if (m.winner === 2) return 'Draw';
  if (m.house !== null) return m.winner === 1 ? 'House won' : 'Player won';
  return `Seat ${m.winner} won`;
}

function LiveProof() {
  const recent = useRecent(8);
  const totals = useTotals();
  const settled = recent.data?.filter((m) => m.state === 3) ?? [];
  return (
    <section className="lx-section" aria-labelledby="live-title">
      <div className="lx-head">
        <p className="lx-eyebrow">Live proof</p>
        <h2 id="live-title" className="lx-h2">Every result here was decided by the contract.</h2>
        <p className="lx-sub">Read straight from <a href={accountUrl(net.arena)} target="_blank" rel="noreferrer" className="mono">{net.arena}</a>. Each settled match stores the referee&apos;s final state hash; open one to replay it in your browser and compare.</p>
      </div>
      <div className="lx-proof">
        <div className="lx-bignums">
          <div><span className="lx-big"><Num value={totals.data?.matches} loading={totals.loading} error={totals.error} /></span><span className="lx-cap">matches staked</span></div>
          <div><span className="lx-big"><Num value={totals.data ? formatNear(totals.data.volume) : undefined} loading={totals.loading} error={totals.error} /></span><span className="lx-cap">NEAR in pots</span></div>
          <div><span className="lx-big"><Num value={totals.data ? String(totals.data.houses) : undefined} loading={totals.loading} error={totals.error} /></span><span className="lx-cap">house bots</span></div>
        </div>
        <div className="lx-table" role="table" aria-label="Recent matches">
          <div className="lx-tr lx-th" role="row"><span role="columnheader">Match</span><span role="columnheader">Players</span><span role="columnheader">Plays</span><span role="columnheader">Referee hash</span><span role="columnheader">Result</span></div>
          {recent.loading ? <div className="lx-tr" role="row"><span className="lx-skel" style={{ width: '60%' }} /></div>
            : recent.error ? <div className="lx-tr" role="row"><span>Matches unavailable: {shortError(recent.error, 80)}</span></div>
              : !recent.data!.length ? <div className="lx-tr" role="row"><span>No matches yet.</span></div>
                : recent.data!.map((m) => (
                  <Link key={m.id} to={`/app/battle/${m.id}`} className="lx-tr" role="row">
                    <span role="cell" className="mono">#{m.id}</span>
                    <span role="cell" className="lx-players">{shortAcct(m.p0)} <i>vs</i> {m.house !== null ? `house · ${shortAcct(m.p1)}` : m.p1 ? shortAcct(m.p1) : 'open'}</span>
                    <span role="cell" className="mono">{m.plays0 + m.plays1}</span>
                    <span role="cell" className="mono">{m.state === 3 ? m.final_hash : '—'}</span>
                    <span role="cell"><b className={`lx-pill${m.state === 3 ? ' lx-pill--gold' : m.state === 2 ? ' lx-pill--live' : ''}`}>{resultOf(m)}</b></span>
                  </Link>
                ))}
        </div>
      </div>
      {settled.length > 0 && <p className="lx-note">Every transaction of the recorded testnet runs is listed in <span className="mono">deployments/testnet-2026-11-09.json</span>.</p>}
    </section>
  );
}

const BEATS = [
  { n: '01', title: 'A session key per match', icon: 'key' as const, body: 'Before you stake, your account adds a function-call key that can call only the arena\'s play method, with a 0.25 NEAR gas allowance. Every drop is signed by it: no pop-ups, and it cannot move funds. It is deleted after settlement.', code: 'AddKey FunctionCall { receiver: arena, methods: ["play"] }' },
  { n: '02', title: 'Plays are stored on-chain', icon: 'layers' as const, body: 'The arena keeps the clock: a drop must land within 5 s of its tick. The log of tick, card and position is the only input to the result. Your stake, deck and the market read at kick-off are stored with it.', code: 'play(id, tick, deck_index, x, y)' },
  { n: '03', title: 'The contract replays the match', icon: 'cpu' as const, body: 'settle runs a Rust port of the deterministic sim (and the house bot) over the stored log, checkpointing if gas runs low, then pays 92% to the winner. A claim that disagrees with the replay is rejected.', code: 'settle(id, claim?) → winner, end tick, state hash' },
];

function Referee() {
  return (
    <section className="lx-section" id="referee" aria-labelledby="ref-title">
      <div className="lx-head">
        <p className="lx-eyebrow">How the chain referees</p>
        <h2 id="ref-title" className="lx-h2">Three steps, no trusted server.</h2>
      </div>
      <ol className="lx-beats">
        {BEATS.map((b) => (
          <li key={b.n} className="lx-beat">
            <div className="lx-beat-top"><span className="lx-beat-n">{b.n}</span><span className="lx-beat-ico"><Icon name={b.icon} size={22} /></span></div>
            <h3 className="lx-h3">{b.title}</h3>
            <p>{b.body}</p>
            <code className="lx-code">{b.code}</code>
          </li>
        ))}
      </ol>
      <div className="lx-callout">
        <img src="/brand/v2/arena-landscape.webp" alt="" aria-hidden />
        <div>
          <p className="lx-eyebrow">Measured</p>
          <p className="lx-callout-big">In the sandbox, a 30-second Rush match with 18 plays replays on-chain for 13 to 18 TGas.</p>
          <p className="lx-sub">That is well under one call&apos;s 300 TGas, so most matches settle in one transaction. Longer matches split across calls: the referee stores its sim state as a checkpoint and resumes. With a 60 TGas budget the sandbox test settles a Rush match in two calls. A fake winner claim was rejected on testnet as well.</p>
        </div>
      </div>
    </section>
  );
}

function Fighters() {
  const market = useMarket();
  const fighters = roster.fighters.filter((f) => f.kind === 'market');
  return (
    <section className="lx-section" id="fighters" aria-labelledby="fighters-title">
      <div className="lx-head">
        <p className="lx-eyebrow">Market fighters</p>
        <h2 id="fighters-title" className="lx-h2">Today&apos;s move becomes tomorrow&apos;s hit points.</h2>
        <p className="lx-sub">At kick-off the arena stores twice each fighter&apos;s 24 h move as its hit-point and damage change, capped at ±15%. Prices are a relayer price (testnet): Coinbase 24 h stats signed with an ed25519 key the contract checks. Pyth no longer serves NEAR, so no oracle is claimed.</p>
      </div>
      <ul className="lx-cards">
        {fighters.map((f) => {
          const p = market.byId.get(f.fighterId);
          return (
            <li key={f.fighterId} className="lx-fighter">
              <div className="lx-fighter-art"><img src={artOf(f.fighterId)} alt="" aria-hidden decoding="async" /></div>
              <div className="lx-fighter-body">
                <div className="lx-fighter-top"><b>{f.ticker}</b><MoveChip statBps={p ? p.statBps : null} state={p?.state} small /></div>
                <span className="lx-fighter-name">{characterOf(f.fighterId)} · {CLASS_NAMES[f.archetype]}</span>
                <span className="lx-fighter-px mono">{p?.price != null ? `$${p.price.toLocaleString('en-US', { maximumFractionDigits: p.price < 10 ? 4 : 2 })}` : market.loading ? '…' : 'no price'}{p?.moveBps != null ? ` · ${pct(p.moveBps, 2)} 24 h` : ''}</span>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Houses() {
  const houses = useHouses();
  return (
    <section className="lx-section lx-section--tight" aria-labelledby="houses-title">
      <div className="lx-split">
        <div className="lx-head">
          <p className="lx-eyebrow">House bots</p>
          <h2 id="houses-title" className="lx-h2">Rivals with their own wallets.</h2>
          <p className="lx-sub">Each house is a NEAR sub-account of the arena that funds its own treasury. It accepts challenges at a fixed stake and plays the published bot, run by the referee inside the replay, so it never signs a move. Its record and treasury are public.</p>
        </div>
        <ul className="lx-houses">
          {houses.loading ? <li className="lx-house"><span className="lx-skel" style={{ width: '70%' }} /></li>
            : houses.error ? <li className="lx-house">Houses unavailable: {shortError(houses.error, 80)}</li>
              : houses.data!.map((h) => (
                <li key={h.index} className="lx-house">
                  <img src={artOf(h.deck[0])} alt="" aria-hidden decoding="async" />
                  <div>
                    <b>{h.name}</b> <span className="lx-pill">{HOUSE_LEVEL[h.difficulty]}</span>
                    <a className="mono lx-acct" href={accountUrl(h.account)} target="_blank" rel="noreferrer">{h.account}</a>
                  </div>
                  <dl><div><dt>Treasury</dt><dd>{formatNear(h.treasury, 3)} Ⓝ</dd></div><div><dt>Record</dt><dd>{h.wins}–{h.losses}–{h.draws}</dd></div><div><dt>Stake</dt><dd>{formatNear(h.stake)} Ⓝ</dd></div></dl>
                </li>
              ))}
        </ul>
      </div>
    </section>
  );
}

const TECH = [
  { k: 'Function-call access keys', v: 'Per-match session keys limited to play. A sandbox test proves the key cannot stake, settle or transfer.' },
  { k: 'NEP-366 meta transactions', v: 'Adding and deleting session keys, settling and cancelling are signed in the browser and paid for by the relayer. Only the stake costs the player gas.' },
  { k: 'Sub-accounts', v: 'Players are sub-accounts the relayer creates for a key made in the browser; houses and the treasury are sub-accounts of the arena.' },
  { k: 'On-chain ed25519 verification', v: 'post_prices checks env::ed25519_verify against the relayer key before a price counts, and refuses stale or tampered snapshots.' },
  { k: 'Deterministic replay in WASM', v: 'The TypeScript sim is ported line for line to Rust; a parity test replays 60 recorded matches and compares the state hash every 40 ticks.' },
  { k: 'Weekly season, paid automatically', v: '3% of each pot funds the season. The first settle of a new season pays the previous top three 50/30/20.' },
];

function NearTech() {
  return (
    <section className="lx-section" id="near" aria-labelledby="near-title">
      <div className="lx-head">
        <p className="lx-eyebrow">Built on NEAR</p>
        <h2 id="near-title" className="lx-h2">What NEAR does here, concretely.</h2>
      </div>
      <dl className="lx-tech">
        {TECH.map((t) => <div key={t.k}><dt>{t.k}</dt><dd>{t.v}</dd></div>)}
      </dl>
    </section>
  );
}

export function Landing() {
  return (
    <div className="lx">
      <Hero />
      <main>
        <LiveProof />
        <Referee />
        <Fighters />
        <Houses />
        <NearTech />
        <section className="lx-final" aria-labelledby="final-title">
          <h2 id="final-title" className="lx-h2">Pick eight. Read the market. Fight.</h2>
          <div className="lx-ctas"><Link className="lx-btn" to="/app">Enter the arena <Icon name="arrow" size={18} /></Link><Link className="lx-btn lx-btn--ghost" to="/app/practice">Practice free</Link></div>
        </section>
      </main>
      <footer className="lx-foot">
        <span>Mempire on NEAR testnet · arena <a className="mono" href={accountUrl(net.arena)} target="_blank" rel="noreferrer">{net.arena}</a> · treasury <span className="mono">{shortAcct(deploymentInfo.treasury)}</span></span>
        <span>Stakes are testnet NEAR. MIT licensed. Original names and art.</span>
      </footer>
    </div>
  );
}
