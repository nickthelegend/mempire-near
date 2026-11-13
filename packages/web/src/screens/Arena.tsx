// SPDX-License-Identifier: MIT
// The lobby: next match, house duel and practice cards, the player card, the record, live matches, the deck and the season.
import { CountUp, PlaysTicker } from '../ui/live';
import { useState } from 'react';
import { Link } from 'react-router';
import { formatNear, FORMAT_NAMES, TIER_NAMES } from '@mempire/sdk';
import { useAccount } from '../state/account';
import { useOpen, usePlayer, useRecent, useSeason, useTotals } from '../state/data';
import { statFor, useMarket } from '../state/market';
import { useMatchmaking, type Matchmaking } from '../state/matchmaking';
import { characterOf, costOf, pct, TIER_BADGES, shortAcct, shortError } from '../lib/fighters';
import { badgeArt, houseArt, OBJ3D } from '../lib/art';
import type { Step } from '../lib/play';
import { AddrLink, Art, Avatar, Big, Countdown, FighterCard, Icon, Loading, MoveChip, StateBox, TxLink } from '../ui/kit';
import { ago, money } from '../ui/market';
import { MatchCard } from './Proof';

export function SignIn() {
  const s = useAccount();
  const [mode, setMode] = useState<'email' | 'guest'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [handle, setHandle] = useState('');
  const emailReady = s.relayerInfo?.email.configured;
  if (s.device) {
    return (
      <section className="card stack" id="signin" aria-labelledby="acct-title">
        <div className="card-head">
          <h2 id="acct-title" className="h3">Your account</h2>
          <span className="chip chip--jade">Signed in</span>
        </div>
        <div className="wallet">
          <span className="wallet-coin" aria-hidden>Ⓝ</span>
          <div className="stack" style={{ gap: 2, minWidth: 0 }}>
            <span className="label">Balance</span>
            <Big value={s.balance === null ? undefined : formatNear(s.balance)} unit="NEAR" tone="ivory" loading={s.balance === null} />
          </div>
        </div>
        <div className="fine" style={{ overflowWrap: 'anywhere' }}><AddrLink address={s.device.accountId} full /></div>
        <p className="fine">{s.device.kind==='wallet'?'Your NEAR wallet signs the stake, play-key setup, settlement and key deletion. Card drops use a local play-only key; no operator relayer is needed.':<>{s.device.email ? `Signed in with ${s.device.email}. ` : ''}Your key stays in this browser. The relayer pays gas for session keys and settlement; you pay only your stake.</>}</p>
        <button className="btn btn--white btn--sm" onClick={() => { if (s.device?.kind==='wallet'||confirm('Sign out? The key for this account lives only in this browser; without it the account cannot be used again.')) s.signOut(); }}>Sign out</button>
      </section>
    );
  }
  return (
    <section className="card card--gold stack" id="signin" aria-labelledby="signin-title">
      <div className="card-head">
        <h2 id="signin-title" className="h3">Sign in to stake</h2>
        <span className="chip">No wallet needed</span>
      </div>
      <p className="fine">The relayer creates a NEAR testnet account for a key made in this browser, with {s.relayerInfo?.starterNear ?? '0.3'} NEAR to start. Practice needs no account.</p>
      {s.relayerError ? <StateBox kind="setup" title="Setup required: relayer">{s.relayerError}</StateBox> : (
        <>
          <div className="seg" role="group" aria-label="Sign-in method">
            <button aria-pressed={mode === 'email'} onClick={() => setMode('email')}>Email</button>
            <button aria-pressed={mode === 'guest'} onClick={() => setMode('guest')}>Guest</button>
          </div>
          {mode === 'email' ? (
            !s.relayerInfo ? <Loading label="Checking the relayer" lines={1} />
              : !emailReady ? <StateBox kind="setup" title={`Setup required: ${s.relayerInfo.email.missing}`}>Email codes need an email provider key on the relayer. Use Guest meanwhile: same account, no email.</StateBox>
                : !sent ? (
                  <form className="stack" style={{ gap: 8 }} onSubmit={(e) => { e.preventDefault(); void s.startEmail(email).then(() => setSent(true)).catch(() => {}); }}>
                    <label className="label" htmlFor="email">Email</label>
                    <input id="email" className="input" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
                    <button className="btn btn--blue btn--wide" disabled={!!s.busy}>{s.busy ? <span className="spinner" /> : <Icon name="mail" />}{s.busy || 'Send me a code'}</button>
                  </form>
                ) : (
                  <form className="stack" style={{ gap: 8 }} onSubmit={(e) => { e.preventDefault(); void s.verifyEmail(email, code); }}>
                    <label className="label" htmlFor="code">6-digit code sent to {email}</label>
                    <input id="code" className="input mono" inputMode="numeric" pattern="[0-9]{6}" required value={code} onChange={(e) => setCode(e.target.value)} />
                    <button className="btn btn--blue btn--wide" disabled={!!s.busy}>{s.busy ? <span className="spinner" /> : null}{s.busy || 'Create my account'}</button>
                  </form>
                )
          ) : (
            <form className="stack" style={{ gap: 8 }} onSubmit={(e) => { e.preventDefault(); void s.guest(handle); }}>
              <label className="label" htmlFor="handle">Arena name</label>
              <input id="handle" className="input" maxLength={20} value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="e.g. nightowl" />
              <button className="btn btn--blue btn--wide" disabled={!!s.busy}>{s.busy ? <span className="spinner" /> : <Icon name="key" />}{s.busy || 'Create a guest account'}</button>
            </form>
          )}
        </>
      )}
      <button className="btn btn--white btn--wide" disabled={!!s.busy} onClick={()=>void s.connectWallet()}><Icon name="key" />{s.busy==='Connecting NEAR wallet'?s.busy:'Connect NEAR wallet'}</button>
      {s.error && <StateBox kind="error" title="Sign-in failed">{shortError(s.error, 240)}</StateBox>}
    </section>
  );
}

export function StepList({ steps }: { steps: Step[] }) {
  if (!steps.length) return null;
  return (
    <ol className="rail">
      {steps.map((s, i) => (
        <li key={i} data-state="done">
          <span className="dot" aria-hidden><Icon name="check" size={13} /></span>
          <div><div className="rail-title">{s.label}</div>{s.hash && <div className="rail-sub"><TxLink hash={s.hash} /></div>}</div>
        </li>
      ))}
    </ol>
  );
}


/* ── The lobby ─────────────────────────────────────────────────────────── */

/** Blue hero: the next PvP match, its stake tier and format, and the big Battle button. */
function NextMatch({ mm }: { mm: Matchmaking }) {
  const { me, stakes, stake, tier, format, busy, waiting } = mm;
  const totals = useTotals();
  const waitingHere = mm.waitingHere && mm.waitingHere !== '0' ? mm.waitingHere : null;
  return (
    <section className="hero-card" id="play" aria-labelledby="fight-title">
      <h1 id="fight-title" className="hero-title">{TIER_NAMES[tier]} arena<br />{FORMAT_NAMES[format]} PvP</h1>
      <p className="hero-kicker">{totals.data ? <><CountUp value={Number(totals.data.settled)} /> matches refereed on-chain so far</> : 'Real players, refereed on-chain'}</p>
      <Art className="hero-mascot" src={OBJ3D.crown} width={300} height={300} eager fallback={<span />} />
      <div className="hero-panel">
        {waiting ? (
          <div className="waiting" role="status">
            <div className="waiting-head"><span className="chip chip--live">Open</span><b>Match #{waiting}</b></div>
            <p className="fine">Your stake is escrowed by the arena. The first player to join at this stake starts the match; the arena reads the market at that moment.</p>
            <button className="btn btn--red btn--sm" disabled={!!busy} onClick={() => void mm.onCancel()}>{busy ? <span className="spinner" /> : null}Cancel and refund</button>
          </div>
        ) : (
          <>
            <div className="hero-facts">
              <div className="fact"><span className="fact-ico fact-ico--coin" aria-hidden>Ⓝ</span><div><span className="fact-k">Pot</span><b className="num">{stake ? `${formatNear(BigInt(stake) * 2n)} NEAR` : mm.config.error ? 'n/a' : '…'}</b></div></div>
              <div className="fact"><span className="fact-ico" aria-hidden><Icon name="clock" size={22} /></span><div><span className="fact-k">Status</span><b>{mm.open.loading ? 'Checking…' : waitingHere ? `#${waitingHere} waiting` : 'Open to start'}</b></div></div>
            </div>
            {mm.config.error ? <StateBox kind="error" title="Arena unreachable">{shortError(mm.config.error)}</StateBox> : !stakes ? <Loading label="Loading stake tiers" lines={1} /> : (
              <div className="tiers" role="group" aria-label="Stake tier">
                {stakes.map((s, i) => (
                  <button key={i} className="tier" aria-pressed={tier === i} onClick={() => mm.setTier(i)} aria-label={`${TIER_NAMES[i]}: ${formatNear(s)} NEAR each`}>
                    <Art className="tier-badge" src={badgeArt(TIER_BADGES[i])} fallback={<span className="tier-badge-ph">{TIER_NAMES[i][0]}</span>} />
                    <span className="tname">{TIER_NAMES[i]}</span>
                    <span className="tstake num">{formatNear(s)} Ⓝ</span>
                  </button>
                ))}
              </div>
            )}
            <div className="seg seg--fmt" role="group" aria-label="Format">
              <button aria-pressed={format === 1} onClick={() => mm.setFormat(1)}>Rush<small>30 s · most crowns</small></button>
              <button aria-pressed={format === 0} onClick={() => mm.setFormat(0)}>Standard<small>3 min + overtime</small></button>
            </div>
          </>
        )}
      </div>
      {!waiting && (!me ? <a className="btn btn--green btn--battle" href="#signin">Sign in to battle <Icon name="arrow" size={26} /></a> : (
        <button className="btn btn--green btn--battle" disabled={!mm.signer || !stake || !!mm.deckError || !!busy || !mm.enough(stake)} onClick={() => void mm.onFight()}>
          {busy ? <><span className="spinner" />{busy}…</> : <>Battle{stake ? ` · ${formatNear(stake)} Ⓝ` : ''} <Icon name="arrow" size={26} /></>}
        </button>
      ))}
      {me && stake && mm.balance !== null && !mm.enough(stake) && <p className="hero-warn">Your balance cannot cover this stake plus gas.</p>}
    </section>
  );
}

function SideCards({ mm }: { mm: Matchmaking }) {
  const houses = mm.houses.data;
  const minStake = houses?.length ? houses.reduce((m, h) => (BigInt(h.stake) < m ? BigInt(h.stake) : m), BigInt(houses[0].stake)) : null;
  return (
    <div className="side-cards">
      <Link to="/app/houses" className="mode mode--purple">
        <span className="mode-arrow" aria-hidden><Icon name="arrow" size={20} /></span>
        <Art className="mode-art" src={OBJ3D.shield} width={110} height={110} fallback={<span className="mode-ico"><Icon name="castle" size={44} /></span>} />
        <span className="mode-t">Fight a house</span>
        <span className="mode-s">Kumo, Tora or Ryu: the referee plays their published bot.</span>
        <span className="mode-foot">
          <span className="mode-chip"><Icon name="castle" size={13} />{minStake !== null ? `from ${formatNear(minStake)} Ⓝ` : 'Loading…'}</span>
          <span className="mode-faces">{(houses ?? []).slice(0, 3).map((h) => { const a = houseArt(h.name); return <span key={h.index} className="face">{a ? <Art src={a} fallback={<Avatar id={h.deck[0]} size={34} />} /> : <Avatar id={h.deck[0]} size={34} />}</span>; })}</span>
        </span>
      </Link>
      <Link to="/app/practice" className="mode mode--orange">
        <span className="mode-arrow" aria-hidden><Icon name="arrow" size={20} /></span>
        <Art className="mode-art" src={OBJ3D.cards} width={110} height={110} fallback={<span className="mode-ico"><Icon name="play" size={44} /></span>} />
        <span className="mode-t">Practice</span>
        <span className="mode-s">A 30-second Rush with your deck: the training bot, or a house&apos;s real deck.</span>
        <span className="mode-foot">
          <span className="mode-chip"><Icon name="clock" size={13} />Free · 30 s</span>
          <span className="mode-faces">{[9, 10, 7].map((id) => <span key={id} className="face"><Avatar id={id} size={34} /></span>)}</span>
        </span>
      </Link>
    </div>
  );
}

function PlayerCard({ mm }: { mm: Matchmaking }) {
  const { me, balance, deck } = mm;
  const season = useSeason(me);
  const stats = usePlayer(me);
  const rank = season.data?.info.top.findIndex((t) => t.account === me) ?? -1;
  return (
    <section className="player" aria-labelledby="player-title">
      <span className="player-ava"><Avatar id={deck[0] ?? 6} size={84} /></span>
      <span className="player-k">Your player</span>
      <h2 id="player-title" className="player-name">{me ? shortAcct(me).split('.')[0] : 'Sign in to play'}</h2>
      <div className="player-chips">
        <span className="pchip"><Icon name="trophy" size={13} />{!me ? 'Unranked' : rank >= 0 ? `#${rank + 1} in season` : 'Unranked'}</span>
        <span className="pchip"><Icon name="bolt" size={13} />{me && season.data?.points != null ? `${season.data.points} pts` : '0 pts'}</span>
      </div>
      <dl className="player-bal">
        <div><dt>NEAR</dt><dd className="num">{!me ? '—' : balance === null ? '…' : formatNear(balance, 3)}</dd></div>
        <div><dt>Stake</dt><dd className="num">{mm.stake ? `${formatNear(mm.stake)} Ⓝ` : '—'}</dd></div>
      </dl>
      <div className="player-boxes">
        <div><b className="num">{me && stats.data ? stats.data.matches : '—'}</b><span>Matches</span></div>
        <div><b className="num">{me && stats.data ? stats.data.streak : '—'}</b><span>Streak</span></div>
      </div>
      {me ? <Link className="btn btn--blue btn--pill" to="/app/profile">My profile <Icon name="arrow" size={18} /></Link> : <a className="btn btn--blue btn--pill" href="#signin">Sign in <Icon name="arrow" size={18} /></a>}
      <Link to="/app/deck" className="player-deck" aria-label="Your battle deck: edit">
        <span className="player-deck-k">Battle deck</span>
        <span className="player-deck-row">{deck.map((id, i) => <Avatar key={i} id={id} size={28} />)}</span>
      </Link>
    </section>
  );
}

function RecordTiles({ me }: { me: string | null }) {
  const stats = usePlayer(me);
  const season = useSeason(me);
  const v = (x: number | undefined) => (!me ? '—' : stats.loading ? '…' : stats.error ? 'n/a' : String(x ?? 0));
  const tiles = [
    { k: 'Wins', v: v(stats.data?.wins), art: OBJ3D.trophy, icon: 'trophy' as const, tone: 'green' },
    { k: 'Matches', v: v(stats.data?.matches), art: OBJ3D.tower, icon: 'shield' as const, tone: 'yellow' },
    { k: 'Season points', v: !me ? '—' : season.data?.points != null ? String(season.data.points) : '…', art: OBJ3D.crown, icon: 'crown' as const, tone: 'purple' },
    { k: 'Best streak', v: v(stats.data?.best_streak), art: OBJ3D.up, icon: 'flame' as const, tone: 'blue' },
  ];
  return (
    <section className="record" aria-labelledby="record-title">
      <h2 id="record-title" className="record-title"><span>Your player record</span></h2>
      <div className="record-tiles">
        {tiles.map((t) => (
          <div key={t.k} className={`rtile rtile--${t.tone}`}>
            <Art className="rtile-art" src={t.art} width={60} height={60} fallback={<span className="rtile-ico"><Icon name={t.icon} size={30} /></span>} />
            <div><b className="num">{t.v}</b><span>{t.k}</span></div>
          </div>
        ))}
      </div>
    </section>
  );
}

function LiveMatches({ me }: { me: string | null }) {
  const recent = useRecent(6);
  const open = useOpen();
  const waiting = open.data?.filter((x) => x !== '0').length ?? 0;
  return (
    <section className="panel" aria-labelledby="live-title">
      <div className="panel-head">
        <h2 id="live-title" className="title-lg">Live from the arena</h2>
        <Link to="/app/proof" className="link-strong">All proof <Icon name="out" size={16} /></Link>
      </div>
      {waiting > 0 && <div className="notice"><span className="notice-ico" aria-hidden><Icon name="bolt" size={24} /></span><div><b>{waiting} match{waiting === 1 ? '' : 'es'} waiting for an opponent</b><p className="fine">Battle at the same stake and format joins the waiting match.</p></div><a className="btn btn--blue btn--sm" href="#play">Join</a></div>}
      {recent.loading ? <Loading label="Loading matches" lines={4} /> : recent.error ? <StateBox kind="error" title="Matches unavailable">{shortError(recent.error)}</StateBox>
        : !recent.data!.length ? <StateBox art title="No matches yet">The first staked match will appear here.</StateBox>
          : <ul className="mlist">{recent.data!.map((m) => <MatchCard key={m.id} m={m} me={me} />)}</ul>}
    </section>
  );
}

function DeckBlock({ deck }: { deck: number[] }) {
  const market = useMarket();
  const buffed = deck.filter((id) => (statFor(market.byId, id) ?? 0) > 0).length;
  const avg = deck.reduce((a, id) => a + costOf(id), 0) / deck.length;
  return (
    <section className="panel panel--split" aria-labelledby="deck-title">
      <div className="split-info">
        <h2 id="deck-title" className="split-title">Pick your eight</h2>
        <p>Market fighters carry today&apos;s 24 h move into the match as a hit-point and damage change. House fighters are always neutral.</p>
        <p className="split-fine">The deck is saved in this browser and sent with your stake. Elixir costs come from each fighter&apos;s class.</p>
      </div>
      <div className="split-body">
        <div className="deck-grid deck-grid--8">
          {deck.map((id, i) => <FighterCard key={i} id={id} size="sm" statBps={statFor(market.byId, id)} pulse={market.byId.get(id)?.state} />)}
        </div>
        <div className="deck-stats">
          <span className="pill pill--elixir"><Icon name="drop" size={14} />{avg.toFixed(1)} avg cost</span>
          <span className={`pill${buffed ? ' pill--jade' : ''}`}><Icon name="up" size={14} />{market.list.length ? `${buffed} buffed today` : 'Reading market…'}</span>
        </div>
        <div className="cta-row"><Link to="/app/deck" className="btn btn--green btn--lg">Edit deck <Icon name="cards" size={20} /></Link><Link to="/app/cards" className="btn btn--white btn--lg">All cards</Link></div>
      </div>
    </section>
  );
}

function Leaderboard({ me }: { me: string | null }) {
  const season = useSeason(me);
  const info = season.data?.info;
  const SHARES = [50n, 30n, 20n];
  return (
    <section className="panel" aria-labelledby="lb-title">
      <div className="panel-head">
        <div><h2 id="lb-title" className="title-lg">Season {season.data?.current ?? '…'} leaderboard</h2><p className="fine">{info ? <>Ends in <Countdown to={Number(info.end_ms) / 1000} /></> : season.error ? 'Season unavailable' : '…'}</p></div>
        <Link to="/app/leaderboard" className="link-strong">Full leaderboard <Icon name="arrow" size={16} /></Link>
      </div>
      {season.loading ? <Loading label="Loading the season" lines={3} /> : season.error ? <StateBox kind="error" title="Season unavailable">{shortError(season.error)}</StateBox> : info && (
        <table className="tbl">
          <thead><tr><th>Rank</th><th>Player</th><th>Points</th><th>Share of {formatNear(info.pool)} Ⓝ</th></tr></thead>
          <tbody>
            {[0, 1, 2].map((i) => {
              const t = info.top[i];
              return (
                <tr key={i} data-you={t?.account === me}>
                  <td><span className={`rank rank--${i + 1}`}>{i + 1}</span></td>
                  <td>{t ? (t.account === me ? 'You' : <AddrLink address={t.account} />) : <span className="fine">Open seat</span>}</td>
                  <td className="num">{t ? t.points : '—'}</td>
                  <td className="num">{SHARES[i]}% · {formatNear((BigInt(info.pool) * SHARES[i]) / 100n)} Ⓝ</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}

function MarketTable() {
  const m = useMarket();
  const priced = m.list.filter((p) => p.state !== 'house').sort((a, b) => b.statBps - a.statBps);
  const newest = Math.max(0, ...priced.map((p) => p.updatedAt));
  return (
    <section className="panel" aria-labelledby="mk-title">
      <div className="panel-head">
        <h2 id="mk-title" className="title-lg">Live market fighters</h2>
        <span className="fine">{newest ? `Posted ${ago(newest)}` : m.loading ? 'Reading…' : ''}</span>
      </div>
      {m.loading && !priced.length ? <Loading label="Reading prices" lines={4} /> : m.error && !priced.length ? <StateBox kind="error" title="Prices unavailable">{shortError(m.error)}</StateBox> : (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Fighter</th><th>Price</th><th>24 h</th><th>In battle</th></tr></thead>
            <tbody>
              {priced.map((p) => (
                <tr key={p.fighterId}>
                  <td><span className="tbl-f"><Avatar id={p.fighterId} size={34} /><b>{p.ticker}</b><span className="fine hide-sm">{characterOf(p.fighterId)}</span></span></td>
                  <td className="num">{money(p.price)}</td>
                  <td className={`num ${p.moveBps != null && p.moveBps >= 0 ? 'up' : 'down'}`}>{p.moveBps != null ? pct(p.moveBps, 2) : '—'}</td>
                  <td><MoveChip statBps={p.statBps} state={p.state} small /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="fine">Relayer price (testnet): Coinbase 24 h stats, signed by the relayer key and verified by the arena with ed25519. Each fighter gets twice its move at kick-off, capped at ±15%.</p>
    </section>
  );
}

export function Arena() {
  const mm = useMatchmaking();
  const { me } = mm;
  return (
    <div className="lobby">
      <div className="lobby-top">
        <NextMatch mm={mm} />
        <SideCards mm={mm} />
        <PlayerCard mm={mm} />
      </div>
      {(mm.steps.length > 0 || mm.error) && (
        <div className="panel">
          <StepList steps={mm.steps} />
          {mm.error && <StateBox kind="error" title="That didn't go through">{shortError(mm.error, 260)}</StateBox>}
        </div>
      )}
      <PlaysTicker />
      <RecordTiles me={me} />
      <div className="lobby-row">
        <LiveMatches me={me} />
        <SignIn />
      </div>
      <DeckBlock deck={mm.deck} />
      <div className="lobby-row lobby-row--even">
        <Leaderboard me={me} />
        <MarketTable />
      </div>
    </div>
  );
}
