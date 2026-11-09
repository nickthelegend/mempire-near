// SPDX-License-Identifier: MIT
import { Link } from 'react-router';
import { formatNear } from '@mempire/sdk';
import { useAccount } from '../state/account';
import { usePlayer, useSeason, useTotals } from '../state/data';
import { shortAcct, shortError } from '../lib/fighters';
import { AddrLink, Big, Countdown, Icon, Loading, StateBox } from '../ui/kit';

const SHARES = [50, 30, 20];
export function Season() {
  const me = useAccount((s) => s.device?.accountId ?? null);
  const season = useSeason(me);
  const stats = usePlayer(me);
  const totals = useTotals();
  const info = season.data?.info;
  const prev = season.data?.previous;
  return (
    <div className="section stack" style={{ gap: 16 }}>
      <section className="panel panel--glow stack" aria-labelledby="season-title">
        <div className="panel-head">
          <div>
            <h1 id="season-title" className="display h2 ivory">Season {season.data?.current ?? '…'}</h1>
            <p className="fine">{season.data?.current === 0 ? 'Launch season: a short first season so the payout can be seen on testnet. Every season after it runs 7 days.' : 'Weekly. The top three split the pool 50 / 30 / 20.'}</p>
          </div>
          {info && <span className="chip chip--sapphire"><Icon name="clock" size={14} /><Countdown to={Number(info.end_ms) / 1000} /></span>}
        </div>
        {season.loading ? <Loading label="Loading the season" lines={4} /> : season.error ? <StateBox kind="error" title="Season unavailable">{shortError(season.error)}</StateBox> : info && (
          <>
            <div className="well"><span className="label">Prize pool · 3% of every pot</span><div><Big value={formatNear(info.pool)} unit="NEAR" tone="sapphire" /></div></div>
            <ol className="podium" aria-label="Top three">
              {[0, 1, 2].map((i) => {
                const t = info.top[i];
                return (
                  <li key={i} className="podium-row" data-rank={i + 1} data-you={t?.account === me}>
                    <span className="podium-rank">{i + 1}</span>
                    <div className="stack" style={{ gap: 2, minWidth: 0 }}>
                      {t ? <><b className="podium-name">{t.account === me ? 'You' : shortAcct(t.account)}</b><span className="fine">{t.points} points</span></> : <span className="fine">Open seat: win a match to take it</span>}
                    </div>
                    <span className="podium-share"><b>{SHARES[i]}%</b><small>{formatNear((BigInt(info.pool) * BigInt(SHARES[i])) / 100n)} Ⓝ</small></span>
                  </li>
                );
              })}
            </ol>
            <p className="fine">Points: a win scores the tier base (1, 3, 10, 30) times your streak, up to 5. When the first match of the next season settles, the arena pays this top three in the same transaction; anyone can also call <span className="mono">finalize_season</span>. Unfilled shares roll into the next pool.</p>
            {season.data?.points != null && <span className="chip chip--sapphire" style={{ justifySelf: 'start' }}>You: {season.data.points} points</span>}
          </>
        )}
      </section>

      {prev && (
        <section className="panel stack" aria-labelledby="prev-title">
          <div className="panel-head"><h2 id="prev-title" className="display h3 ivory">Season {prev.season}</h2><span className={`chip ${prev.finalized ? 'chip--gold' : ''}`}>{prev.finalized ? 'Paid out' : 'Pays at next settle'}</span></div>
          {prev.paid.length === 0 && !prev.finalized ? <p className="fine">Pool {formatNear(prev.pool)} NEAR, {prev.top.length} ranked.</p> : (
            <ul className="list">
              {prev.paid.map((p, i) => (
                <li key={p.account} className="list-row" style={{ gridTemplateColumns: 'auto 1fr auto' }}>
                  <span className="chip chip--gold">#{i + 1}</span><AddrLink address={p.account} /><span className="num" style={{ color: 'var(--sapphire)', fontWeight: 700 }}>{formatNear(p.amount)} Ⓝ</span>
                </li>
              ))}
              {prev.finalized && BigInt(prev.rolled_over) > 0n && <li className="list-row" style={{ gridTemplateColumns: '1fr auto' }}><span className="s">Rolled into season {prev.season + 1}</span><span className="num">{formatNear(prev.rolled_over)} Ⓝ</span></li>}
            </ul>
          )}
        </section>
      )}

      <section className="panel stack" aria-labelledby="you-title">
        <div className="panel-head"><h2 id="you-title" className="display h3 ivory">Your record</h2></div>
        {!me ? <StateBox title="Not signed in" action={<Link className="key key--sm" to="/app#signin">Sign in</Link>}>Sign in to stake and climb the ladder.</StateBox>
          : stats.loading ? <Loading label="Loading your record" lines={2} /> : stats.error ? <StateBox kind="error" title="Record unavailable">{shortError(stats.error)}</StateBox> : (
            <div className="stats3">
              <div className="stat stat--season"><Big value={`${stats.data!.wins}–${stats.data!.losses}`} tone="ivory" /><span className="label">W–L ({stats.data!.draws} D)</span></div>
              <div className="stat stat--burn"><Big value={String(stats.data!.streak)} tone="ember" /><span className="label">Streak</span></div>
              <div className="stat stat--wait"><Big value={String(stats.data!.best_streak)} tone="gold" /><span className="label">Best</span></div>
            </div>
          )}
      </section>

      <section className="panel stack" aria-labelledby="arena-title">
        <div className="panel-head"><h2 id="arena-title" className="display h3 ivory">Arena totals</h2><span className="chip">from chain</span></div>
        {totals.loading ? <Loading label="Loading totals" lines={2} /> : totals.error ? <StateBox kind="error" title="Totals unavailable">{shortError(totals.error)}</StateBox> : (
          <ul className="list">
            <li className="list-row" style={{ gridTemplateColumns: '1fr auto' }}><span className="s">Matches refereed on-chain</span><b className="num">{totals.data!.settled}</b></li>
            <li className="list-row" style={{ gridTemplateColumns: '1fr auto' }}><span className="s">Ticks replayed by the referee</span><b className="num">{Number(totals.data!.refereed_ticks).toLocaleString('en-US')}</b></li>
            <li className="list-row" style={{ gridTemplateColumns: '1fr auto' }}><span className="s">NEAR staked in pots</span><b className="num">{formatNear(totals.data!.volume)}</b></li>
            <li className="list-row" style={{ gridTemplateColumns: '1fr auto' }}><span className="s">Paid to season winners</span><b className="num">{formatNear(totals.data!.season_paid)}</b></li>
          </ul>
        )}
      </section>
    </div>
  );
}
