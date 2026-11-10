// SPDX-License-Identifier: MIT
// All-time ladder computed from every settled match on the arena, plus the current season's on-chain top three.
import { Link } from 'react-router';
import { formatNear } from '@mempire/sdk';
import { useAccount } from '../state/account';
import { useSeason } from '../state/data';
import { ladder, mascotOf, useHistory, winRate, type LadderRow } from '../state/history';
import { artOf, shortAcct, shortError } from '../lib/fighters';
import { ART } from '../lib/art';
import { Art, Avatar, Countdown, Icon, Loading, StateBox } from '../ui/kit';

const PODIUM = [1, 0, 2];
const name = (a: string, me: string | null) => (a === me ? 'You' : shortAcct(a).split('.')[0]);
const ago = (ms: number) => { const m = Math.round((Date.now() - ms) / 60000); return m < 60 ? `${Math.max(1, m)} min ago` : m < 2880 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`; };

function Podium({ rows, me }: { rows: LadderRow[]; me: string | null }) {
  return (
    <ol className="lb-podium" aria-label="Top three all time">
      {PODIUM.map((i) => {
        const r = rows[i];
        const fav = r ? mascotOf(r.account) : undefined;
        return (
          <li key={i} className="lb-plinth" data-rank={i + 1} data-you={r?.account === me}>
            {r ? (
              <Link to={`/app/player/${r.account}`} className="lb-plinth-link" aria-label={`Rank ${i + 1}: ${name(r.account, me)}, ${r.wins} wins`}>
                {i === 0 && <Art className="lb-crown" src={ART.crown} fallback={<Icon name="crown" size={30} />} />}
                <Art className="lb-art" src={artOf(fav ?? 6)} fallback={<Avatar id={fav ?? 6} size={90} />} />
                <span className="lb-name">{name(r.account, me)}</span>
                <span className="lb-sub num">{r.wins} win{r.wins === 1 ? '' : 's'} · {formatNear(r.won)} Ⓝ</span>
              </Link>
            ) : <div className="lb-plinth-link lb-plinth-empty"><span className="lb-name">Open</span><span className="lb-sub">Win a staked match</span></div>}
            <div className="lb-block"><span>{i + 1}</span></div>
          </li>
        );
      })}
    </ol>
  );
}

export function Leaderboard() {
  const me = useAccount((s) => s.device?.accountId ?? null);
  const history = useHistory();
  const season = useSeason(me);
  const rows = history.matches ? ladder(history.matches) : [];
  const myRank = me ? rows.findIndex((r) => r.account === me) : -1;
  const info = season.data?.info;
  return (
    <div className="screen">
      <section className="lb-hero" aria-labelledby="lb-title">
        <div className="lb-hero-copy">
          <p className="eyebrow eyebrow--light">Leaderboard · all time</p>
          <h1 id="lb-title" className="h1 lb-title">Who rules the arena</h1>
          <p className="lb-lede">Ranked by wins, then NEAR won. Computed from every match the on-chain referee settled; house bots are on their own page.</p>
          {myRank >= 0 && <span className="chip chip--gold">You are #{myRank + 1} of {rows.length}</span>}
        </div>
        {history.loading && !history.matches ? <Loading label="Reading every match" lines={2} /> : rows.length > 0 && <Podium rows={rows} me={me} />}
      </section>

      <div className="lb-grid">
        <section className="card stack" aria-labelledby="lb-table">
          <div className="card-head"><h2 id="lb-table" className="h3">All players</h2><span className="chip">{history.matches ? `${history.matches.filter((m) => m.state === 3).length} settled matches` : '…'}</span></div>
          {history.loading && !history.matches ? <Loading label="Reading every match" lines={5} />
            : history.error && !history.matches ? <StateBox kind="error" title="Matches unavailable">{shortError(history.error)}</StateBox>
              : !rows.length ? <StateBox art title="No settled player matches yet" action={<Link className="btn btn--green btn--sm" to="/app">Battle</Link>}>The first staked win puts you at the top.</StateBox>
                : (
                  <div className="tbl-wrap">
                    <table className="tbl lb-tbl">
                      <thead><tr><th>#</th><th>Player</th><th>W–L–D</th><th className="hide-sm">Win rate</th><th>NEAR won</th><th className="hide-sm">Last match</th></tr></thead>
                      <tbody>
                        {rows.map((r, i) => {
                          const fav = mascotOf(r.account);
                          return (
                            <tr key={r.account} data-you={r.account === me}>
                              <td><span className={`rank rank--${Math.min(i + 1, 4)}`}>{i + 1}</span></td>
                              <td><Link className="tbl-f" to={`/app/player/${r.account}`}><Avatar id={fav} size={34} /><b>{name(r.account, me)}</b></Link></td>
                              <td className="num">{r.wins}–{r.losses}–{r.draws}</td>
                              <td className="num hide-sm">{winRate(r) ?? '—'}%</td>
                              <td className="num">{formatNear(r.won)} Ⓝ</td>
                              <td className="fine hide-sm">{r.lastMs ? ago(r.lastMs) : '—'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
        </section>

        <aside className="stack lb-side">
          <section className="card stack" aria-labelledby="lb-season">
            <div className="card-head"><h2 id="lb-season" className="h3">Season {season.data?.current ?? '…'}</h2>{info && <span className="chip chip--sky"><Countdown to={Number(info.end_ms) / 1000} /></span>}</div>
            {season.loading ? <Loading label="Loading the season" lines={3} /> : season.error ? <StateBox kind="error" title="Season unavailable">{shortError(season.error)}</StateBox> : info && (
              <>
                <p className="fine">Stored by the arena. The top three split {formatNear(info.pool)} NEAR 50 / 30 / 20 when the season ends.</p>
                <ol className="season-mini">
                  {[0, 1, 2].map((i) => {
                    const t = info.top[i];
                    return (
                      <li key={i} data-you={t?.account === me}>
                        <span className={`rank rank--${i + 1}`}>{i + 1}</span>
                        <span className="sm-name">{t ? (t.account === me ? 'You' : shortAcct(t.account)) : 'Open seat'}</span>
                        <b className="num">{t ? `${t.points} pts` : '—'}</b>
                      </li>
                    );
                  })}
                </ol>
                <Link to="/app/season" className="btn btn--blue btn--sm btn--wide">Season details <Icon name="arrow" size={18} /></Link>
              </>
            )}
          </section>
          <section className="card card--gold stack">
            <h2 className="h3">Climb it</h2>
            <p className="fine">Win staked matches against players or houses. Bigger stake tiers earn more season points, and a win streak multiplies them up to five times.</p>
            <Link to="/app" className="btn btn--green btn--wide">Battle <Icon name="swords" size={20} /></Link>
          </section>
        </aside>
      </div>
    </div>
  );
}
