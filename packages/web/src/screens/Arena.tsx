// SPDX-License-Identifier: MIT
// The lobby: deck on one side, the arena and its Battle button in the centre, season and trophies on the other.
import { useState } from 'react';
import { Link } from 'react-router';
import { formatNear, FORMAT_NAMES, TIER_NAMES } from '@mempire/sdk';
import { useAccount } from '../state/account';
import { usePlayer, useSeason, useTotals } from '../state/data';
import { statFor, useMarket } from '../state/market';
import { useMatchmaking } from '../state/matchmaking';
import { costOf, TIER_BADGES, shortAcct, shortError } from '../lib/fighters';
import { ART, badgeArt } from '../lib/art';
import type { Step } from '../lib/play';
import { AddrLink, Art, Big, Countdown, FighterCard, Icon, Loading, StateBox, TxLink } from '../ui/kit';
import { PulseList } from '../ui/market';

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
        <p className="fine">{s.device.email ? `Signed in with ${s.device.email}. ` : ''}Your key stays in this browser. The relayer pays gas for session keys and settlement; you pay only your stake.</p>
        <button className="btn btn--white btn--sm" onClick={() => { if (confirm('Sign out? The key for this account lives only in this browser; without it the account cannot be used again.')) s.signOut(); }}>Sign out</button>
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

/** Left column: the battle deck as it stands with today's market. */
function DeckPanel({ deck }: { deck: number[] }) {
  const market = useMarket();
  const buffed = deck.filter((id) => (statFor(market.byId, id) ?? 0) > 0).length;
  const avg = deck.reduce((a, id) => a + costOf(id), 0) / deck.length;
  return (
    <section className="card stack lobby-deck" aria-labelledby="deck-title">
      <div className="card-head">
        <h2 id="deck-title" className="h3">Battle deck</h2>
        <Link to="/app/deck" className="btn btn--white btn--xs">Edit</Link>
      </div>
      <div className="deck-grid">
        {deck.map((id, i) => <FighterCard key={i} id={id} size="sm" statBps={statFor(market.byId, id)} pulse={market.byId.get(id)?.state} />)}
      </div>
      <div className="deck-stats">
        <span className="pill pill--elixir"><Icon name="drop" size={14} />{avg.toFixed(1)} avg cost</span>
        <span className={`pill${buffed ? ' pill--jade' : ''}`}><Icon name="up" size={14} />{market.list.length ? `${buffed} buffed today` : 'Reading market…'}</span>
      </div>
    </section>
  );
}

/** Right column: the season race and your trophies. */
function SeasonPanel({ me }: { me: string | null }) {
  const season = useSeason(me);
  const stats = usePlayer(me);
  const info = season.data?.info;
  const max = Math.max(1, ...(info?.top.map((t) => t.points) ?? [1]));
  const SHARES = [5000n, 3000n, 2000n];
  return (
    <section className="card stack" aria-labelledby="sr-title">
      <div className="season-banner">
        <Art className="season-trophy" src={ART.trophy} fallback={<Icon name="trophy" size={34} />} />
        <div className="stack" style={{ gap: 2, minWidth: 0 }}>
          <h2 id="sr-title" className="h3">Season {season.data?.current ?? '…'}</h2>
          <span className="fine">{info ? <>Ends in <Countdown to={Number(info.end_ms) / 1000} /></> : season.error ? 'Season unavailable' : 'Loading…'}</span>
        </div>
      </div>
      {season.loading ? <Loading label="Loading the season" lines={3} /> : season.error ? <StateBox kind="error" title="Season unavailable">{shortError(season.error)}</StateBox> : info && (
        <>
          <div className="pool"><span className="label">Prize pool · 3% of every pot</span><Big value={formatNear(info.pool)} unit="NEAR" tone="gold" /></div>
          <ol className="race" aria-label="Top three">
            {[0, 1, 2].map((i) => {
              const t = info.top[i];
              const you = !!t && t.account === me;
              return (
                <li key={i} className="race-row" data-rank={i + 1} data-you={you}>
                  <span className="race-rank">{i + 1}</span>
                  <div className="race-bar"><i style={{ width: t ? `${(t.points / max) * 100}%` : '0%' }} /><span>{!t ? 'Open seat' : `${you ? 'You' : shortAcct(t.account)} · ${t.points} pt${t.points === 1 ? '' : 's'}`}</span></div>
                  <span className="race-share num">{formatNear((BigInt(info.pool) * SHARES[i]) / 10000n)}</span>
                </li>
              );
            })}
          </ol>
        </>
      )}
      <div className="trophies" aria-label="Your record">
        {!me ? <p className="fine">Sign in to earn season points: a win scores the tier base times your streak.</p>
          : stats.loading ? <Loading label="Loading your record" lines={1} />
            : stats.error ? <p className="fine">Record unavailable: {shortError(stats.error, 80)}</p> : (
              <>
                <div><b className="num">{stats.data!.wins}–{stats.data!.losses}</b><span className="label">W–L</span></div>
                <div><b className="num">{stats.data!.streak}</b><span className="label">Streak</span></div>
                <div><b className="num">{season.data?.points ?? 0}</b><span className="label">Points</span></div>
              </>
            )}
      </div>
      <Link to="/app/season" className="btn btn--white btn--sm">Full season</Link>
    </section>
  );
}

export function Arena() {
  const mm = useMatchmaking();
  const { me, stakes, stake, tier, format, busy, waiting } = mm;
  const totals = useTotals();
  return (
    <div className="lobby">
      <div className="lobby-left">
        <DeckPanel deck={mm.deck} />
        {me && <SignIn />}
      </div>

      <section className="lobby-centre" id="play" aria-labelledby="fight-title">
        <div className="stage">
          <Art className="stage-art" src={ART.arena} eager fallback={<span className="stage-ph" />} />
          <div className="stage-top">
            <span className="stage-tag"><Icon name="swords" size={16} />PvP · {FORMAT_NAMES[format]}</span>
            <span className="stage-tag stage-tag--dark num">{totals.data ? `${totals.data.settled} refereed on-chain` : totals.error ? 'Arena unreachable' : 'Reading the arena…'}</span>
          </div>
          <h1 id="fight-title" className="stage-title">{TIER_NAMES[tier]} Arena</h1>
          <div className="stage-pot">
            <span className="label">Pot</span>
            <b className="num">{stake ? `${formatNear(BigInt(stake) * 2n)} Ⓝ` : '…'}</b>
          </div>
        </div>

        <div className="picker">
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
        </div>

        {waiting ? (
          <div className="waiting" role="status">
            <div className="waiting-head"><span className="chip chip--live">Open</span><b>Match #{waiting}</b></div>
            <p className="fine">Your stake is escrowed by the arena. The first player to join at this stake starts the match; the arena reads the market at that moment.</p>
            <button className="btn btn--red btn--sm" disabled={!!busy} onClick={() => void mm.onCancel()}>{busy ? <span className="spinner" /> : null}Cancel and refund</button>
          </div>
        ) : (
          <div className="battle-cta">
            {!me ? <a className="btn btn--gold btn--battle" href="#signin"><Icon name="key" size={28} />Sign in to battle</a> : (
              <button className="btn btn--gold btn--battle" disabled={!mm.signer || !stake || !!mm.deckError || !!busy || !mm.enough(stake)} onClick={() => void mm.onFight()}>
                {busy ? <><span className="spinner" />{busy}…</> : <><Icon name="swords" size={30} />Battle</>}
              </button>
            )}
            <p className="fine battle-note" role="status">
              {mm.open.loading ? 'Checking for open matches…' : mm.waitingHere && mm.waitingHere !== '0' ? `Match #${mm.waitingHere} is waiting at this stake. Battle joins it.` : 'Nobody is waiting at this stake. Battle opens a match.'}
              {stake ? ` You stake ${formatNear(stake)} Ⓝ.` : ''}
            </p>
            {me && stake && mm.balance !== null && !mm.enough(stake) && <p className="fine warn">Your balance cannot cover this stake plus gas.</p>}
            <div className="cta-row">
              <Link className="btn btn--white" to="/app/practice"><Icon name="play" size={18} />Practice · free</Link>
              <Link className="btn btn--blue" to="/app/houses"><Icon name="castle" size={18} />Fight a house</Link>
            </div>
          </div>
        )}
        <StepList steps={mm.steps} />
        {mm.error && <StateBox kind="error" title="That didn't go through">{shortError(mm.error, 260)}</StateBox>}
        {!me && <SignIn />}
      </section>

      <div className="lobby-right">
        <SeasonPanel me={me} />
        <section className="card stack" aria-labelledby="mk-title">
          <div className="card-head"><h2 id="mk-title" className="h3">Market today</h2><span className="chip">relayer price</span></div>
          <PulseList />
        </section>
      </div>
    </div>
  );
}

