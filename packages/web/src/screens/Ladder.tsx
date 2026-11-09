import { useState } from 'react';
import { Link } from 'react-router';
import { ArenaClient } from '@mempire/sdk';
import { publicClient } from '../chain/wallet';
import { useChainStore } from '../state/chain';
import { useWallet } from '../state/wallet';
import { useMatchHistory, usePlayerStats, useSeason } from '../state/data';
import { formatWif } from '../state/format';
import { TIER_NAMES, ZERO, shortAddr } from '../lib/fighters';
import { AddrLink, Big, Countdown, Icon, Loading, StateBox, TxLink } from '../ui/kit';

const SHARES = [5000n, 3000n, 2000n];
const TIER_POINTS = [1, 3, 10, 30];

export function Ladder() {
  const w = useWallet();
  const address = w.data?.address;
  const wallet = w.data?.wallet;
  const arena = useChainStore((s) => s.arena);
  const season = useSeason(address);
  const stats = usePlayerStats(address);
  const history = useMatchHistory(address);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [view, setView] = useState<'now' | 'last'>('now');

  async function finalize() {
    if (!arena || !wallet || !season.data) return;
    setBusy('Finalizing');
    try {
      const hash = await new ArenaClient(publicClient, arena.arena, wallet).finalizeSeason(season.data.current - 1);
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== 'success') throw new Error('Finalization reverted');
      window.location.reload();
    } catch (e) { setError((e as Error).message); } finally { setBusy(''); }
  }

  const info = view === 'now' ? season.data?.info : season.data?.previous;
  const seasonNo = season.data ? (view === 'now' ? season.data.current : season.data.current - 1) : null;

  const top = info ? info[2].map((p) => Number(p)) : [];
  const max = Math.max(1, ...top, Number(season.data?.points ?? 0n));
  const inTop = !!info && !!address && info[1].some((p) => p.toLowerCase() === address.toLowerCase());

  return (
    <div className="section stack" style={{ gap: 18 }}>
      <section className="panel panel--glow stack" aria-labelledby="season-title" style={{ overflow: 'hidden' }}>
        <img src="/brand/v2/fx-victory.webp" alt="" aria-hidden width={150} height={150} style={{ position: 'absolute', right: -14, top: -14, width: 112, height: 112, opacity: 0.55, pointerEvents: 'none' }} />
        <div className="stack" style={{ gap: 4 }}>
          <span className="label">Weekly season race</span>
          <h1 id="season-title" className="display h1 ivory">Season {seasonNo ?? '…'}</h1>
        </div>
        <div className="seg" role="group" aria-label="Season">
          <button aria-pressed={view === 'now'} onClick={() => setView('now')}>This season</button>
          <button aria-pressed={view === 'last'} disabled={!season.data || season.data.current === 0} onClick={() => setView('last')}>Last season</button>
        </div>
        {season.loading ? <Loading label="Loading the season from chain" lines={3} />
          : season.error ? <StateBox kind="error" title="Season unavailable">{season.error}</StateBox>
            : !info ? <StateBox title="No previous season yet">Season 0 is the first one.</StateBox> : (
              <>
                <div className="row between" style={{ alignItems: 'flex-end' }}>
                  <div><span className="label">Prize pool</span><div><Big value={formatWif(info[0], 0)} unit="WIF" tone="sapphire" /></div></div>
                  <div style={{ textAlign: 'right' }}><span className="label">{view === 'now' ? 'Ends in' : 'Status'}</span><div className="display" style={{ fontSize: 26, color: 'var(--ivory)' }}>{view === 'now' ? <Countdown to={season.data!.end} /> : info[3] ? 'Paid out' : 'Ready to pay'}</div></div>
                </div>
                <p className="fine">3% of every pot settled this season.{view === 'last' ? ` Burned this season: ${formatWif(info[4], 0)} WIF.` : ''}</p>
                <ol className="race" aria-label="Top three">
                  {[0, 1, 2].map((i) => {
                    const player = info[1][i];
                    const empty = player === ZERO;
                    const you = !empty && player.toLowerCase() === address?.toLowerCase();
                    return (
                      <li key={i} className="race-row" data-rank={i + 1} data-you={you}>
                        <span className="race-rank">{i + 1}</span>
                        <div className="race-bar"><i style={{ width: empty ? '0%' : `${(Number(info[2][i]) / max) * 100}%` }} /><span>{empty ? <span className="fine">Open seat · no points yet</span> : <>{you ? 'You' : shortAddr(player)} <span className="fine">{info[2][i].toString()} pts</span></>}</span></div>
                        <span className="num" style={{ fontWeight: 700, color: 'var(--sapphire)', textAlign: 'right' }}>{formatWif((info[0] * SHARES[i]) / 10000n, 0)}<small className="fine"> WIF</small></span>
                      </li>
                    );
                  })}
                  {view === 'now' && address && !inTop && (
                    <li className="race-row" data-you="true">
                      <span className="race-rank" style={{ background: 'var(--surface-3)', color: 'var(--ivory)', fontSize: 13 }}>You</span>
                      <div className="race-bar"><i style={{ width: `${(Number(season.data?.points ?? 0n) / max) * 100}%` }} /><span>{season.data?.points?.toString() ?? '0'} pts <span className="fine">· win to climb</span></span></div>
                      <span />
                    </li>
                  )}
                </ol>
                <p className="fine">The top three split the pool 50 / 30 / 20. An empty rank&apos;s share is burned when the season is finalized; anyone can finalize a finished season.</p>
                {view === 'last' && season.data?.canFinalize && (
                  <button className="key" disabled={!wallet || !!busy} onClick={() => void finalize()}>{busy ? <span className="spinner" /> : null}Pay out season {season.data.current - 1}</button>
                )}
              </>
            )}
        {error && <StateBox kind="error" title="Finalize failed">{error}</StateBox>}
      </section>

      <section className="panel stack" aria-labelledby="you-title">
        <h2 id="you-title" className="display h3 ivory">Your record</h2>
        {!address ? <StateBox art title="Connect to see your record">Your wins, streak and points are read from the arena contract.</StateBox>
          : stats.loading ? <Loading label="Loading your record" lines={2} />
            : stats.error ? <StateBox kind="error" title="Record unavailable">{stats.error}</StateBox> : (
              <>
                <div className="stats3" style={{ padding: 0 }}>
                  <div className="stat stat--season"><Big value={season.data?.points?.toString() ?? '0'} tone="sapphire" /><span className="label">Points</span></div>
                  <div className="stat stat--wait"><Big value={String(stats.data![3])} unit={`best ${stats.data![4]}`} tone="gold" /><span className="label">Win streak</span></div>
                  <div className="stat stat--wait"><Big value={`${Math.min(5, Math.max(1, stats.data![3] + 1))}x`} tone="ivory" /><span className="label">Next win</span></div>
                </div>
                <div className="row" style={{ gap: 6 }}>
                  <span className="chip chip--jade">{stats.data![0]} won</span>
                  <span className="chip chip--crimson">{stats.data![1]} lost</span>
                  <span className="chip">{stats.data![2]} tied</span>
                  <span className="chip">{stats.data![6]} played</span>
                  <span className={`chip ${stats.data![5] > 0 ? 'chip--ember' : ''}`} title="Matches where the two claims disagreed and both stakes were refunded">{stats.data![5]} disputed</span>
                </div>
              </>
            )}
      </section>

      <section className="panel stack" aria-labelledby="hist-title">
        <h2 id="hist-title" className="display h3 ivory">Your matches</h2>
        {!address ? <StateBox title="No wallet">Connect to see your settled matches.</StateBox>
          : history.loading ? <Loading label="Reading your matches from chain events" lines={3} />
            : history.error ? <StateBox kind="error" title="History unavailable">{history.error}</StateBox>
              : !history.data?.length ? <StateBox art title="No matches yet">Your settled and refunded matches will show here, each with its transaction.</StateBox> : (
                <ul className="list">
                  {history.data.map((x) => {
                    const seat = x.match.p0.toLowerCase() === address.toLowerCase() ? 0 : 1;
                    const opp = seat === 0 ? x.match.p1 : x.match.p0;
                    const d = x.event.data as { winner?: number; paid?: bigint; disputed?: boolean };
                    const won = x.event.kind === 'settled' && d.winner === seat;
                    const tie = x.event.kind === 'settled' && d.winner === 2;
                    const amount = x.event.kind !== 'settled' ? null : won ? d.paid ?? 0n : tie ? (d.paid ?? 0n) / 2n : -x.match.stake;
                    const open = () => { localStorage.removeItem('mempire:practice'); localStorage.setItem('mempire:activeMatch', x.event.id.toString()); };
                    return (
                      <li key={x.event.hash} className="list-row">
                        <span className={`chip ${won ? 'chip--jade' : tie || x.event.kind === 'voided' ? '' : 'chip--crimson'}`}>{x.event.kind === 'voided' ? 'Refund' : won ? 'Won' : tie ? 'Tie' : 'Lost'}</span>
                        <div style={{ minWidth: 0 }}>
                          <div className="t"><Link to="/battle" onClick={open}>Match #{x.event.id.toString()}</Link> vs {opp === ZERO ? 'nobody' : <AddrLink address={opp} />}</div>
                          <div className="s">{TIER_NAMES[x.match.tier]} · <TxLink hash={x.event.hash} /></div>
                        </div>
                        {amount === null ? <span className="fine">stake back</span>
                          : amount > 0n ? <span className="num" style={{ color: 'var(--gold-hi)', fontWeight: 800 }}>+{formatWif(amount, 0)}</span>
                            : <span className="fine num">−{formatWif(-amount, 0)}</span>}
                      </li>
                    );
                  })}
                </ul>
              )}
      </section>

      <section className="panel stack" aria-labelledby="pts-title">
        <h2 id="pts-title" className="display h3 ivory">How points work</h2>
        <p className="fine">Win a staked match: points = the tier&apos;s base × your win streak, up to 5×. A loss resets the streak; a tie leaves it.</p>
        <div className="tiers">
          {TIER_NAMES.map((t, i) => (
            <div key={t} className="tier" style={{ minHeight: 0, cursor: 'default' }}>
              <img src={`/brand/v2/badge-${['pauper', 'knight', 'duke', 'emperor'][i]}.webp`} width={48} height={48} alt="" aria-hidden style={{ width: 48, height: 48 }} />
              <span className="tname">{t}</span>
              <span className="tstake">{TIER_POINTS[i]}–{TIER_POINTS[i] * 5}</span>
              <span className="fine" style={{ fontSize: 10.5 }}>pts a win</span>
            </div>
          ))}
        </div>
        <p className="fine"><Icon name="bolt" size={13} /> 5th win in a row at Emperor: {TIER_POINTS[3] * 5} points.</p>
      </section>
    </div>
  );
}
