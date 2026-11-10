// SPDX-License-Identifier: MIT
// One match's referee receipt: who played, what the arena paid, the market it read at kick-off, every stored play, and
// a replay of that log in this browser through the same sim, compared with the hash the contract stored.
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { formatNear, replayFromChain, FORMAT_NAMES, STATE_NAMES, TIER_NAMES, type MatchView } from '@mempire/sdk';
import { useAccount } from '../state/account';
import { reader } from '../state/data';
import { isHouse, mascotOf } from '../state/history';
import { net, accountUrl } from '../lib/net';
import { crownsTaken, tickClock, towerHealth } from '../lib/match';
import { receiptTxs } from '../lib/receipts';
import { fighter, shortAcct, shortError, statusLabel } from '../lib/fighters';
import { AddrLink, Avatar, Big, Crowns, Icon, Loading, MoveChip, StateBox, TxLink } from '../ui/kit';

type Replay = Awaited<ReturnType<typeof replayFromChain>>;

function sideName(m: MatchView, seat: 0 | 1) {
  const a = seat === 0 ? m.p0 : m.p1;
  if (!a) return 'Waiting…';
  return shortAcct(a);
}

/** Drop positions on a small field: the arena is 18 by 32 tiles, seat 0 at the bottom. */
function DropMap({ replay }: { replay: Replay }) {
  return (
    <svg className="dropmap" viewBox="0 0 18 32" role="img" aria-label={`${replay.inputs.length} drops on the field: blue seat 0, red seat 1`}>
      <rect x="0" y="0" width="18" height="32" rx="1.2" className="dm-grass" />
      <rect x="0" y="15" width="18" height="2" className="dm-river" />
      <rect x="2.6" y="14.6" width="1.8" height="2.8" rx=".3" className="dm-bridge" />
      <rect x="13.6" y="14.6" width="1.8" height="2.8" rx=".3" className="dm-bridge" />
      {[[3.5, 26, 0], [14.5, 26, 0], [9, 29.5, 0], [3.5, 6, 1], [14.5, 6, 1], [9, 2.5, 1]].map(([x, y, o], i) => (
        <rect key={i} x={x - 1} y={y - 1} width="2" height="2" rx=".4" className={o === 0 ? 'dm-tower0' : 'dm-tower1'} />
      ))}
      {replay.inputs.map((p, i) => (
        <circle key={i} cx={p.x / 1024} cy={32 - p.y / 1024} r=".55" className={p.player === 0 ? 'dm-drop0' : 'dm-drop1'} />
      ))}
    </svg>
  );
}

export function Receipt() {
  const { id = '' } = useParams();
  const me = useAccount((s) => s.device?.accountId ?? null);
  const [m, setM] = useState<MatchView | null | undefined>(undefined);
  const [error, setError] = useState('');
  const [replay, setReplay] = useState<Replay | null>(null);
  const [replayError, setReplayError] = useState('');
  useEffect(() => {
    let alive = true;
    setM(undefined); setReplay(null); setError(''); setReplayError('');
    void (async () => {
      try {
        const match = await reader.match(id);
        if (!alive) return;
        setM(match);
        if (match && match.state >= 2 && match.state !== 4) {
          try { const r = await replayFromChain(net, id); if (alive) setReplay(r); }
          catch (e) { if (alive) setReplayError((e as Error).message); }
        }
      } catch (e) { if (alive) setError((e as Error).message); }
    })();
    return () => { alive = false; };
  }, [id]);

  if (m === undefined && !error) return <div className="screen"><div className="card"><Loading label={`Reading match #${id} from the arena`} lines={5} /></div></div>;
  if (error) return <div className="screen"><StateBox kind="error" title={`Match #${id} unavailable`}>{shortError(error, 240)}</StateBox></div>;
  if (!m) return <div className="screen"><StateBox title={`No match #${id}`} action={<Link className="btn btn--blue btn--sm" to="/app/proof">Recent matches</Link>}>The arena {net.arena} has no match with that number.</StateBox></div>;

  const settled = m.state === 3;
  const mySeat: 0 | 1 | null = me ? (m.p0 === me ? 0 : m.p1 === me ? 1 : null) : null;
  const title = !settled ? (STATE_NAMES[m.state] ?? 'Match')
    : m.winner === 2 ? 'Draw'
      : mySeat !== null ? (m.winner === mySeat ? 'Victory' : 'Defeat')
        : m.house !== null ? (m.winner === 1 ? 'House won' : 'Player won') : `${sideName(m, m.winner as 0 | 1)} won`;
  const crowns = replay ? [crownsTaken(replay.final, 0), crownsTaken(replay.final, 1)] : null;
  const pot = BigInt(m.stake) * 2n;
  const txs = receiptTxs(m.id);
  const plays = replay?.inputs ?? [];
  const seats = [0, 1] as const;
  return (
    <div className="screen">
      <nav className="crumbs" aria-label="Breadcrumb"><Link to="/app/proof"><Icon name="chevL" size={16} />All matches</Link></nav>
      <section className={`rc-hero${title === 'Defeat' ? ' rc-hero--defeat' : ''}`} aria-labelledby="rc-title">
        <div className="rc-hero-top">
          <span className="chip chip--gold">Referee receipt · match #{m.id}</span>
          <span className="chip">{TIER_NAMES[m.tier]} · {FORMAT_NAMES[m.format]}</span>
        </div>
        <h1 id="rc-title" className="rc-title">{title}</h1>
        <div className="rc-vs">
          {seats.map((seat) => {
            const a = seat === 0 ? m.p0 : m.p1;
            const won = settled && m.winner === seat;
            const deck = seat === 0 ? m.deck0 : m.deck1;
            return (
              <div key={seat} className={`rc-side rc-side--${seat}${won ? ' is-win' : ''}`}>
                <Avatar id={a ? mascotOf(a) : deck[0] ?? 0} size={72} ring={won ? 'gold' : seat === 1 ? 'crimson' : undefined} />
                <div className="rc-side-name">
                  {a ? (isHouse(a) ? <a href={accountUrl(a)} target="_blank" rel="noreferrer">House {shortAcct(a).split('.')[0]}</a> : <Link to={`/app/player/${a}`}>{a === me ? 'You' : sideName(m, seat)}</Link>) : 'Waiting…'}
                  {won && <span className="chip chip--gold">Winner</span>}
                </div>
                {crowns ? <Crowns n={crowns[seat]} side={seat === 0 ? 'blue' : 'red'} /> : <span className="fine">{replayError ? 'Crowns n/a' : settled ? 'Replaying…' : ''}</span>}
                {replay && <span className="fine num">Towers {Math.round(towerHealth(replay.final, seat) * 100)}% standing</span>}
              </div>
            );
          })}
          <span className="rc-vs-badge" aria-hidden>VS</span>
        </div>
        <div className="rc-pot">
          <div><span className="label">Pot</span><Big value={formatNear(pot)} unit="NEAR" tone="ivory" /></div>
          {settled && <>
            <div><span className="label">{m.winner === 2 ? 'Each side got' : 'Winner got · 92%'}</span><Big value={formatNear(m.winner === 2 ? BigInt(m.paid) / 2n : BigInt(m.paid))} unit="NEAR" tone="gold" /></div>
            <div><span className="label">Treasury · 5%</span><Big value={formatNear(m.to_treasury)} unit="NEAR" tone="ember" /></div>
            <div><span className="label">Season {m.season} · 3%</span><Big value={formatNear(m.to_season)} unit="NEAR" tone="sapphire" /></div>
          </>}
        </div>
        <div className="cta-row">
          <Link className="btn btn--gold btn--lg" to={`/app/battle/${m.id}`}><Icon name="replay" size={20} />{m.state === 2 ? 'Watch live' : 'Watch the replay'}</Link>
          <Link className="btn btn--white btn--lg" to="/app">Battle again</Link>
        </div>
      </section>

      <div className="rc-grid">
        <section className="card stack" aria-labelledby="rc-verify">
          <div className="card-head"><h2 id="rc-verify" className="h3">Checked in your browser</h2><span className="chip">same sim as the contract</span></div>
          {!settled && m.state !== 2 ? <p className="fine">{m.state === 1 ? 'Waiting for an opponent: nothing to replay yet.' : 'Cancelled before it started; the stake was refunded.'}</p>
            : replayError ? <StateBox kind="error" title="Replay failed">{shortError(replayError, 200)}</StateBox>
              : !replay ? <p className="fine" role="status"><span className="spinner" /> Replaying {m.plays0 + m.plays1} stored plays…</p>
                : (
                  <>
                    <div className={`verify${!settled || replay.matchesChain ? '' : ' verify--bad'}`} role="status">
                      <span className="verify-ico"><Icon name={!settled || replay.matchesChain ? 'shield' : 'x'} size={22} /></span>
                      <div className="stack" style={{ gap: 2, minWidth: 0 }}>
                        <b>{!settled ? 'Live: the log so far replays cleanly' : replay.matchesChain ? 'Verified: same winner, same final tick, same state hash' : 'Mismatch with the referee'}</b>
                        <span className="fine">{replay.inputs.length} plays replayed to tick {replay.result.end_tick}.</span>
                      </div>
                    </div>
                    <ul className="kv">
                      <li><span>Your browser&apos;s hash</span><b className="mono">{replay.result.final_hash}</b></li>
                      <li><span>Referee&apos;s stored hash</span><b className="mono">{settled ? m.final_hash : '—'}</b></li>
                      <li><span>Ended at tick</span><b className="num">{settled ? `${m.end_tick} (${tickClock(m.end_tick)})` : '—'}</b></li>
                      <li><span>Referee calls</span><b className="num">{settled ? m.referee_calls : '—'}</b></li>
                      <li><span>Seed</span><b className="mono">{m.seed}</b></li>
                      {m.house !== null && <li><span>House moves</span><b>computed by the referee</b></li>}
                    </ul>
                  </>
                )}
        </section>

        <section className="card stack" aria-labelledby="rc-tx">
          <div className="card-head"><h2 id="rc-tx" className="h3">On NEAR testnet</h2><a className="chip chip--btn" href={accountUrl(net.arena)} target="_blank" rel="noreferrer">nearblocks <Icon name="out" size={12} /></a></div>
          <ul className="kv">
            <li><span>Referee contract</span><AddrLink address={net.arena} /></li>
            <li><span>Seat 0</span><AddrLink address={m.p0} /></li>
            {m.p1 && <li><span>{m.house !== null ? 'House' : 'Seat 1'}</span><AddrLink address={m.p1} /></li>}
            {settled && <li><span>Settled</span><b className="num">{new Date(Number(m.settled_ms)).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</b></li>}
          </ul>
          {txs.length ? (
            <ul className="txfeed">
              {txs.slice(0, 14).map((t) => (
                <li key={t.hash} className="txrow">
                  <span className={`chip ${t.source === 'recorded' ? 'chip--sky' : 'chip--jade'}`}>{t.source === 'recorded' ? 'Recorded' : 'This browser'}</span>
                  <span className="txrow-label">{t.label}</span>
                  <TxLink hash={t.hash}>{t.hash.slice(0, 6)}…</TxLink>
                </li>
              ))}
            </ul>
          ) : <p className="fine">The arena stores plays, not transaction hashes. Hashes appear here for the recorded testnet runs and for matches this browser played; every account above links to its full history.</p>}
        </section>
      </div>

      {m.state !== 1 && (
        <section className="card stack" aria-labelledby="rc-market">
          <div className="card-head"><h2 id="rc-market" className="h3">Market read at kick-off</h2><span className="chip">stored per card</span></div>
          <div className="rc-decks">
            {seats.map((seat) => {
              const deck = seat === 0 ? m.deck0 : m.deck1;
              return (
                <div key={seat} className="rc-deck">
                  <span className="label">{seat === 0 ? sideName(m, 0) : sideName(m, 1)}</span>
                  <div className="mstrip">
                    {deck.map((fid, i) => {
                      const slot = seat * 8 + i;
                      const lab = statusLabel(m.status[slot]);
                      return (
                        <div key={slot} className="mslot" title={`${fighter(fid).ticker} · ${lab.long}`}>
                          <Avatar id={fid} size={38} ring={seat === 0 ? 'gold' : 'crimson'} />
                          {lab.live ? <MoveChip statBps={Number(m.mods[slot])} small /> : <span className="move move--flat move--sm">{m.status[slot] === 1 ? 'House' : lab.short}</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {replay && (
        <section className="card" aria-labelledby="rc-log">
          <div className="card-head"><h2 id="rc-log" className="h3">Every stored play</h2><span className="chip">{plays.length} plays · get_plays</span></div>
          <div className="rc-log">
            <DropMap replay={replay} />
            {plays.length === 0 ? <p className="fine">No plays were stored: {m.house !== null ? 'the house bot played alone and ' : ''}the towers decided it.</p> : (
              <ol className="playlog">
                {plays.map((p, i) => {
                  const deck = p.player === 0 ? m.deck0 : m.deck1;
                  const fid = deck[p.deckIndex];
                  return (
                    <li key={i} className={`pl pl--${p.player}`}>
                      <span className="pl-t num">{tickClock(p.tick)}</span>
                      <Avatar id={fid} size={30} ring={p.player === 0 ? 'gold' : 'crimson'} />
                      <span className="pl-name"><b>{fighter(fid).ticker}</b> <span className="fine">by {p.player === 0 ? sideName(m, 0) : sideName(m, 1)}</span></span>
                      <span className="pl-pos mono">{p.x / 1024 < 9 ? 'left' : 'right'} lane · tick {p.tick}</span>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
