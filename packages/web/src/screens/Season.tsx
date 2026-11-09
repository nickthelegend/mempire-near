// SPDX-License-Identifier: MIT
import { Link } from 'react-router';
import { formatNear, TIER_NAMES } from '@mempire/sdk';
import { useAccount } from '../state/account';
import { useConfig, usePlayer, useSeason, useTotals } from '../state/data';
import { TIER_BADGES, shortAcct, shortError } from '../lib/fighters';
import { ART, badgeArt } from '../lib/art';
import { AddrLink, Art, Big, Countdown, Icon, Loading, StateBox } from '../ui/kit';

const SHARES = [50, 30, 20];
const POINTS = [1, 3, 10, 30];
/** Podium order on screen: 2nd, 1st, 3rd. */
const PODIUM = [1, 0, 2];

export function Season() {
  const me = useAccount((s) => s.device?.accountId ?? null);
  const season = useSeason(me);
  const stats = usePlayer(me);
  const totals = useTotals();
  const config = useConfig();
  const info = season.data?.info;
  const prev = season.data?.previous;
  return (
    <div className="screen">
      <section className="season-hero" aria-labelledby="season-title">
        <div className="season-hero-copy">
          <p className="eyebrow">{season.data?.current === 0 ? 'Launch season' : 'Weekly season'}</p>
          <h1 id="season-title" className="h1">Season {season.data?.current ?? '…'}</h1>
          <p className="lede">{season.data?.current === 0 ? 'A short first season so the payout can be seen on testnet. Every season after it runs 7 days.' : 'Weekly. The top three split the pool 50 / 30 / 20.'}</p>
          <div className="season-hero-nums">
            <div className="hero-num"><span className="label">Prize pool</span>{season.loading ? <Big loading /> : season.error ? <Big error={season.error} /> : <Big value={info ? formatNear(info.pool) : '0'} unit="NEAR" tone="gold" />}</div>
            <div className="hero-num"><span className="label">Ends in</span><b className="num">{info ? <Countdown to={Number(info.end_ms) / 1000} /> : '…'}</b></div>
          </div>
        </div>
        <Art className="season-hero-art" src={ART.trophy} fallback={<Icon name="trophy" size={96} />} />
      </section>

      {season.loading ? <div className="card"><Loading label="Loading the season" lines={4} /></div> : season.error ? <StateBox kind="error" title="Season unavailable">{shortError(season.error)}</StateBox> : info && (
        <section className="card stack" aria-labelledby="podium-title">
          <div className="card-head"><h2 id="podium-title" className="h3">The race</h2>{season.data?.points != null && <span className="chip chip--sky">You: {season.data.points} points</span>}</div>
          <ol className="podium" aria-label="Top three">
            {PODIUM.map((i) => {
              const t = info.top[i];
              return (
                <li key={i} className="plinth" data-rank={i + 1} data-you={t?.account === me}>
                  {i === 0 && <Art className="plinth-crown" src={ART.crown} fallback={<Icon name="crown" size={34} />} />}
                  <span className="plinth-name">{t ? (t.account === me ? 'You' : shortAcct(t.account)) : 'Open seat'}</span>
                  <span className="plinth-pts fine">{t ? `${t.points} point${t.points === 1 ? '' : 's'}` : 'Win a match to take it'}</span>
                  <div className="plinth-block">
                    <span className="plinth-rank">{i + 1}</span>
                    <span className="plinth-share"><b>{SHARES[i]}%</b><small className="num">{formatNear((BigInt(info.pool) * BigInt(SHARES[i])) / 100n)} Ⓝ</small></span>
                  </div>
                </li>
              );
            })}
          </ol>
          <p className="fine">When the first match of the next season settles, the arena pays this top three in the same transaction; anyone can also call <span className="mono">finalize_season</span>. Unfilled shares roll into the next pool.</p>
        </section>
      )}

      <div className="season-grid">
        <section className="card stack" aria-labelledby="pts-title">
          <div className="card-head"><h2 id="pts-title" className="h3">Points per win</h2><span className="chip">× streak, up to 5</span></div>
          <ul className="tier-points">
            {TIER_NAMES.map((name, i) => (
              <li key={name}>
                <Art className="tp-badge" src={badgeArt(TIER_BADGES[i])} fallback={<span className="tier-badge-ph">{name[0]}</span>} />
                <span className="tp-name">{name}</span>
                <span className="fine num">{config.data ? `${formatNear(config.data.tier_stakes[i])} Ⓝ stake` : '…'}</span>
                <b className="tp-pts num">{POINTS[i]} pt{POINTS[i] === 1 ? '' : 's'}</b>
              </li>
            ))}
          </ul>
        </section>

        <section className="card stack" aria-labelledby="you-title">
          <div className="card-head"><h2 id="you-title" className="h3">Your trophies</h2></div>
          {!me ? <StateBox title="Not signed in" action={<Link className="btn btn--blue btn--sm" to="/app#signin">Sign in</Link>}>Sign in to stake and climb the ladder.</StateBox>
            : stats.loading ? <Loading label="Loading your record" lines={2} /> : stats.error ? <StateBox kind="error" title="Record unavailable">{shortError(stats.error)}</StateBox> : (
              <div className="trophies trophies--big">
                <div><b className="num">{stats.data!.wins}–{stats.data!.losses}</b><span className="label">W–L ({stats.data!.draws} D)</span></div>
                <div><b className="num">{stats.data!.streak}</b><span className="label">Streak</span></div>
                <div><b className="num">{stats.data!.best_streak}</b><span className="label">Best</span></div>
              </div>
            )}
        </section>

        {prev && (
          <section className="card stack" aria-labelledby="prev-title">
            <div className="card-head"><h2 id="prev-title" className="h3">Season {prev.season}</h2><span className={`chip ${prev.finalized ? 'chip--gold' : ''}`}>{prev.finalized ? 'Paid out' : 'Pays at next settle'}</span></div>
            {prev.paid.length === 0 && !prev.finalized ? <p className="fine">Pool {formatNear(prev.pool)} NEAR, {prev.top.length} ranked.</p> : (
              <ul className="kv">
                {prev.paid.map((p, i) => <li key={p.account}><span><b>#{i + 1}</b> <AddrLink address={p.account} /></span><b className="num">{formatNear(p.amount)} Ⓝ</b></li>)}
                {prev.finalized && BigInt(prev.rolled_over) > 0n && <li><span>Rolled into season {prev.season + 1}</span><b className="num">{formatNear(prev.rolled_over)} Ⓝ</b></li>}
              </ul>
            )}
          </section>
        )}

        <section className="card stack" aria-labelledby="arena-title">
          <div className="card-head"><h2 id="arena-title" className="h3">Arena totals</h2><span className="chip">from chain</span></div>
          {totals.loading ? <Loading label="Loading totals" lines={2} /> : totals.error ? <StateBox kind="error" title="Totals unavailable">{shortError(totals.error)}</StateBox> : (
            <ul className="kv">
              <li><span>Matches refereed on-chain</span><b className="num">{totals.data!.settled}</b></li>
              <li><span>Ticks replayed by the referee</span><b className="num">{Number(totals.data!.refereed_ticks).toLocaleString('en-US')}</b></li>
              <li><span>NEAR staked in pots</span><b className="num">{formatNear(totals.data!.volume)}</b></li>
              <li><span>Paid to season winners</span><b className="num">{formatNear(totals.data!.season_paid)}</b></li>
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
