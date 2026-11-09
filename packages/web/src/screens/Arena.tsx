// SPDX-License-Identifier: MIT
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { formatNear, FORMAT_NAMES, TIER_NAMES, STATE_NAMES, type MatchView } from '@mempire/sdk';
import { useAccount } from '../state/account';
import { chainChanged, reader, useConfig, useHouses, useOpen, useRecent, useSeason, useTotals } from '../state/data';
import { loadDeck, validateDeck } from '../state/deck';
import { statFor, useMarket } from '../state/market';
import { cancel, challenge, fight, type Step } from '../lib/play';
import { HOUSE_LEVEL, TIER_BADGES, shortAcct, shortError } from '../lib/fighters';
import { AddrLink, Avatar, Big, Countdown, FighterCard, Icon, Loading, StateBox, TxLink } from '../ui/kit';
import { MarketTicker } from '../ui/market';

function Hero() {
  const totals = useTotals();
  const season = useSeason();
  const open = useOpen();
  const waiting = open.data?.filter((x) => x !== '0').length ?? 0;
  return (
    <>
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-art"><img src="/brand/v2/keyart-portrait.webp" width={720} height={1080} fetchPriority="high" alt="Two champions clash in a gilded colosseum" /></div>
        <div className="stack" style={{ gap: 14 }}>
          <span className="chip chip--sapphire hero-season">{season.data ? <>Season {season.data.current} · ends in <Countdown to={Number(season.data.info.end_ms) / 1000} /></> : 'Season …'}</span>
          <h1 id="hero-title" className="display hero-title">The market<br />picks your <span className="gold-text">edge</span>.</h1>
          <p className="hero-line">Drop fighters in real time. NEAR replays the match and pays the winner.</p>
          <div className="row" style={{ gap: 10, flexWrap: 'nowrap' }}>
            <a href="#play" className="key key--glint" style={{ flex: 1.3 }}><Icon name="swords" size={22} />Fight</a>
            <Link className="key key--ghost" style={{ flex: 1 }} to="/app/practice">Practice</Link>
          </div>
        </div>
      </section>
      <div className="stats3" role="list" aria-label="Live arena numbers">
        <div className="stat stat--wait" role="listitem"><Big value={String(waiting)} loading={open.loading} error={open.error} tone="ivory" /><span className="label">{waiting === 1 ? 'Match open' : 'Matches open'}</span></div>
        <div className="stat stat--burn" role="listitem"><Big value={totals.data?.settled} loading={totals.loading} error={totals.error} tone="ember" /><span className="label">Refereed</span></div>
        <div className="stat stat--season" role="listitem"><Big value={season.data ? formatNear(season.data.info.pool) : undefined} loading={season.loading} error={season.error} tone="sapphire" /><span className="label">Season Ⓝ</span></div>
      </div>
    </>
  );
}

function SignIn() {
  const s = useAccount();
  const [mode, setMode] = useState<'email' | 'guest'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [handle, setHandle] = useState('');
  const emailReady = s.relayerInfo?.email.configured;
  if (s.device) {
    return (
      <section className="panel stack" id="signin" aria-labelledby="acct-title" style={{ scrollMarginTop: 70 }}>
        <div className="panel-head">
          <h2 id="acct-title" className="display h3 ivory">Your account</h2>
          <span className="chip chip--jade">Signed in</span>
        </div>
        <div className="well" style={{ background: 'radial-gradient(120% 140% at 50% 120%, rgba(232,182,76,.22), rgba(3,12,13,.6) 70%)', borderColor: 'var(--hair)' }}>
          <span className="label">Balance</span>
          <div><Big value={s.balance === null ? undefined : formatNear(s.balance)} unit="NEAR" tone="gold" loading={s.balance === null} /></div>
          <div className="fine" style={{ marginTop: 6, overflowWrap: 'anywhere' }}><AddrLink address={s.device.accountId} full /></div>
        </div>
        <p className="fine">{s.device.email ? `Signed in with ${s.device.email}. ` : ''}Your key stays in this browser. The relayer pays gas for session keys and settlement; you pay only your stake.</p>
        <button className="key key--ghost key--sm" onClick={() => { if (confirm('Sign out? The key for this account lives only in this browser; without it the account cannot be used again.')) s.signOut(); }}>Sign out</button>
      </section>
    );
  }
  return (
    <section className="panel panel--glow stack" id="signin" aria-labelledby="signin-title" style={{ scrollMarginTop: 70 }}>
      <div className="panel-head">
        <h2 id="signin-title" className="display h3 ivory">Sign in to stake</h2>
        <span className="chip">No wallet needed</span>
      </div>
      <p className="fine">The relayer creates a NEAR testnet account for a key made in this browser, with {s.relayerInfo?.starterNear ?? '0.3'} NEAR to start. Practice needs no account.</p>
      {s.relayerError ? <StateBox kind="setup" title="Setup required: relayer">{s.relayerError}</StateBox> : (
        <>
          <div className="seg seg--sm" role="group" aria-label="Sign-in method">
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
                    <button className="key key--wide" disabled={!!s.busy}>{s.busy ? <span className="spinner" /> : <Icon name="mail" />}{s.busy || 'Send me a code'}</button>
                  </form>
                ) : (
                  <form className="stack" style={{ gap: 8 }} onSubmit={(e) => { e.preventDefault(); void s.verifyEmail(email, code); }}>
                    <label className="label" htmlFor="code">6-digit code sent to {email}</label>
                    <input id="code" className="input mono" inputMode="numeric" pattern="[0-9]{6}" required value={code} onChange={(e) => setCode(e.target.value)} />
                    <button className="key key--wide" disabled={!!s.busy}>{s.busy ? <span className="spinner" /> : null}{s.busy || 'Create my account'}</button>
                  </form>
                )
          ) : (
            <form className="stack" style={{ gap: 8 }} onSubmit={(e) => { e.preventDefault(); void s.guest(handle); }}>
              <label className="label" htmlFor="handle">Arena name</label>
              <input id="handle" className="input" maxLength={20} value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="e.g. nightowl" />
              <button className="key key--wide" disabled={!!s.busy}>{s.busy ? <span className="spinner" /> : <Icon name="key" />}{s.busy || 'Create a guest account'}</button>
            </form>
          )}
        </>
      )}
      {s.error && <StateBox kind="error" title="Sign-in failed">{shortError(s.error, 240)}</StateBox>}
    </section>
  );
}

function StepList({ steps }: { steps: Step[] }) {
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

function MatchRow({ m, me }: { m: MatchView; me?: string | null }) {
  const p1 = m.house !== null ? 'House' : m.p1 ? shortAcct(m.p1) : 'waiting…';
  const mine = me && (m.p0 === me || m.p1 === me);
  const result = m.state === 3 ? (m.winner === 2 ? 'Draw' : `Seat ${m.winner} won`) : STATE_NAMES[m.state];
  return (
    <li>
      <Link to={`/app/battle/${m.id}`} className="list-row" style={{ gridTemplateColumns: 'auto 1fr auto', textDecoration: 'none', color: 'inherit' }} aria-label={`Match ${m.id}: ${result}`}>
        <Avatar id={m.deck0[0]} size={30} ring={mine ? 'gold' : undefined} />
        <span className="s" style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}><b style={{ color: 'var(--text)' }}>#{m.id}</b> {shortAcct(m.p0)} vs {p1}</span>
        <span className={`chip ${m.state === 2 ? 'chip--live' : m.state === 3 ? 'chip--gold' : ''}`}>{result}</span>
      </Link>
    </li>
  );
}

export function Arena() {
  const navigate = useNavigate();
  const signer = useAccount((s) => s.signer);
  const me = useAccount((s) => s.device?.accountId ?? null);
  const balance = useAccount((s) => s.balance);
  const config = useConfig();
  const houses = useHouses();
  const recent = useRecent(8);
  const open = useOpen();
  const market = useMarket();
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
  return (
    <div className="lobby">
      <Hero />
      <MarketTicker />
      <div className="section stack" style={{ gap: 16 }}>
        {!me && <SignIn />}
        <section className={`panel panel--glow stack${waiting ? ' play--waiting' : ''}`} id="play" aria-labelledby="fight-title" style={{ scrollMarginTop: 70 }}>
          <div className="panel-head">
            <h2 id="fight-title" className="display h2 ivory">Pick your fight</h2>
            <span className="chip chip--gold">PvP</span>
          </div>
          <div className="stack" style={{ gap: 8 }}>
            <span className="label">Stake per player</span>
            {config.error ? <StateBox kind="error" title="Arena unreachable">{shortError(config.error)}</StateBox> : !stakes ? <Loading label="Loading stake tiers" lines={1} /> : (
              <div className="tiers" role="group" aria-label="Stake tier">
                {stakes.map((s, i) => (
                  <button key={i} className="tier" aria-pressed={tier === i} onClick={() => setTier(i)} aria-label={`${TIER_NAMES[i]}: ${formatNear(s)} NEAR each`}>
                    <img src={`/brand/v2/badge-${TIER_BADGES[i]}.webp`} width={64} height={64} alt="" aria-hidden />
                    <span className="tname">{TIER_NAMES[i]}</span>
                    <span className="tstake">{formatNear(s)}</span>
                    <span className="tburn">NEAR each</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="seg" role="group" aria-label="Format">
            <button aria-pressed={format === 1} onClick={() => setFormat(1)}>Rush<small>30 s · most crowns</small></button>
            <button aria-pressed={format === 0} onClick={() => setFormat(0)}>Standard<small>3 min + overtime</small></button>
          </div>
          <div className="stack" style={{ gap: 10 }}>
            <div className="row between"><span className="label">Your deck · today&apos;s market</span><Link to="/app/deck" className="fine">Edit deck</Link></div>
            <div className="deck-slots">
              {deck.map((id, i) => <FighterCard key={i} id={id} size="sm" statBps={statFor(market.byId, id)} pulse={market.byId.get(id)?.state} />)}
            </div>
          </div>
          {waiting ? (
            <div className="well stack" role="status">
              <div className="row between"><span className="chip chip--live">Open</span><span className="chip num">Match #{waiting}</span></div>
              <p className="fine">Your stake is escrowed by the arena. The first player to join at this stake starts the match; the arena reads the market at that moment.</p>
              <button className="key key--crimson key--sm" disabled={!!busy} onClick={() => void onCancel()}>{busy ? <span className="spinner" /> : null}Cancel and refund</button>
            </div>
          ) : (
            <div className="stack" style={{ gap: 10 }}>
              <p className="fine" role="status">
                {open.loading ? 'Checking for open matches…' : waitingHere && waitingHere !== '0' ? `Match #${waitingHere} is waiting at this stake. Fight joins it.` : 'Nobody is waiting at this stake. Fight opens a match.'}
              </p>
              {!me ? <a className="key key--xl" href="#signin"><Icon name="key" size={24} />Sign in to stake</a> : (
                <button className="key key--xl key--glint" disabled={!signer || !stake || !!deckError || !!busy || !enough(stake)} onClick={() => void onFight()}>
                  {busy ? <><span className="spinner" />{busy}…</> : <><Icon name="swords" size={26} />Fight{stake ? ` for ${formatNear(BigInt(stake) * 2n)} Ⓝ` : ''}</>}
                </button>
              )}
              {me && stake && balance !== null && !enough(stake) && <p className="fine" style={{ color: '#ff9cb0' }}>Your balance cannot cover this stake plus gas.</p>}
              <Link className="key key--ghost key--wide" to="/app/practice">Practice · free</Link>
            </div>
          )}
          <StepList steps={steps} />
          {error && <StateBox kind="error" title="That didn't go through">{shortError(error, 260)}</StateBox>}
        </section>

        <section className="panel stack" aria-labelledby="houses-title">
          <div className="panel-head"><h2 id="houses-title" className="display h3 ivory">Challenge a house</h2><span className="chip">{FORMAT_NAMES[format]}</span></div>
          <p className="fine">House bots are NEAR sub-accounts with their own treasuries. The referee plays their published bot inside the replay, so a house never signs a move.</p>
          {houses.loading ? <Loading label="Loading houses" lines={3} /> : houses.error ? <StateBox kind="error" title="Houses unavailable">{shortError(houses.error)}</StateBox> : (
            <ul className="stack" style={{ gap: 10 }}>
              {houses.data!.map((h) => {
                const covered = BigInt(h.treasury) >= BigInt(h.stake);
                return (
                  <li key={h.index} className="house">
                    <div className="house-art"><Avatar id={h.deck[0]} size={52} ring="crimson" /></div>
                    <div className="stack" style={{ gap: 2, minWidth: 0 }}>
                      <div className="row" style={{ gap: 8 }}><b className="house-name">{h.name}</b><span className="chip">{HOUSE_LEVEL[h.difficulty]}</span></div>
                      <span className="fine">{h.wins}W · {h.losses}L · {h.draws}D · treasury {formatNear(h.treasury, 2)} Ⓝ</span>
                    </div>
                    <button className="key key--sm" disabled={!signer || !!busy || !!deckError || !covered || !enough(h.stake)} onClick={() => void onChallenge(h.index, h.stake)}
                      aria-label={`Challenge ${h.name} for ${formatNear(h.stake)} NEAR`}>{formatNear(h.stake)} Ⓝ</button>
                  </li>
                );
              })}
            </ul>
          )}
          {!me && <p className="fine">Sign in to challenge a house.</p>}
        </section>

        {me && <SignIn />}

        <section className="panel stack" aria-labelledby="recent-title">
          <div className="panel-head"><h2 id="recent-title" className="display h3 ivory">Recent matches</h2><Link to="/app/season" className="fine">Season</Link></div>
          {recent.loading ? <Loading label="Loading matches" lines={3} /> : recent.error ? <StateBox kind="error" title="Matches unavailable">{shortError(recent.error)}</StateBox>
            : !recent.data!.length ? <StateBox art title="No matches yet">The first staked match will appear here.</StateBox>
              : <ul className="list">{recent.data!.map((m) => <MatchRow key={m.id} m={m} me={me} />)}</ul>}
        </section>

        <section className="panel stack" aria-labelledby="pot-title">
          <div className="panel-head"><h2 id="pot-title" className="display h3 ivory">Where a pot goes</h2><span className="chip chip--gold">Contract constants</span></div>
          <div className="split" role="img" aria-label="92 percent to the winner, 5 percent to the treasury, 3 percent to the season pool"><i /><i /><i /></div>
          <div className="legend">
            <span><i style={{ background: 'var(--gold)' }} /><b>92%</b> to the winner</span>
            <span><i style={{ background: 'var(--ember)' }} /><b>5%</b> protocol treasury</span>
            <span><i style={{ background: 'var(--sapphire)' }} /><b>3%</b> weekly season top three</span>
          </div>
          <p className="fine">A draw pays each side 46%. A house&apos;s share goes to its treasury.{config.data ? <> Treasury: <AddrLink address={config.data.treasury} />.</> : null}</p>
        </section>
      </div>
    </div>
  );
}
