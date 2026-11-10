// SPDX-License-Identifier: MIT
// On-chain proof: arena totals, recent matches with the referee's state hash, and where every pot goes.
import { Link } from 'react-router';
import { formatNear, FORMAT_NAMES, STATE_NAMES, TIER_NAMES, type MatchView } from '@mempire/sdk';
import { useAccount } from '../state/account';
import { useConfig, useRecent, useTotals } from '../state/data';
import { shortAcct, shortError } from '../lib/fighters';
import { accountUrl, deploymentInfo, net } from '../lib/net';
import { AddrLink, Avatar, Big, Icon, Loading, StateBox, TxLink } from '../ui/kit';

export function resultOf(m: MatchView) {
  if (m.state !== 3) return STATE_NAMES[m.state] ?? String(m.state);
  if (m.winner === 2) return 'Draw';
  if (m.house !== null) return m.winner === 1 ? 'House won' : 'Player won';
  return `Seat ${m.winner} won`;
}

export function MatchCard({ m, me }: { m: MatchView; me?: string | null }) {
  const mine = !!me && (m.p0 === me || m.p1 === me);
  const p1 = m.house !== null ? `house · ${shortAcct(m.p1)}` : m.p1 ? shortAcct(m.p1) : 'waiting…';
  const won0 = m.state === 3 && m.winner === 0, won1 = m.state === 3 && m.winner === 1;
  return (
    <li>
      <Link to={m.state === 2 ? `/app/battle/${m.id}` : `/app/match/${m.id}`} className={`mcard${mine ? ' mcard--mine' : ''}`} aria-label={`Match ${m.id}: ${resultOf(m)}`}>
        <span className="mcard-id num">#{m.id}</span>
        <span className={`mcard-side${won0 ? ' is-win' : ''}`}><Avatar id={m.deck0[0] ?? 0} size={36} ring={won0 ? 'gold' : undefined} /><span className="mcard-name">{shortAcct(m.p0)}</span></span>
        <span className="mcard-vs" aria-hidden>VS</span>
        <span className={`mcard-side mcard-side--r${won1 ? ' is-win' : ''}`}><span className="mcard-name">{p1}</span>{m.deck1.length > 0 && <Avatar id={m.deck1[0]} size={36} ring={won1 ? 'gold' : undefined} />}</span>
        <span className="mcard-meta">
          <span className={`chip ${m.state === 3 ? 'chip--gold' : m.state === 2 ? 'chip--live' : ''}`}>{resultOf(m)}</span>
          <span className="fine num">{TIER_NAMES[m.tier]} · {FORMAT_NAMES[m.format]} · {m.plays0 + m.plays1} plays{m.state === 3 ? ` · hash ${m.final_hash}` : ''}</span>
        </span>
      </Link>
    </li>
  );
}

export function PotSplit({ note }: { note?: boolean }) {
  const config = useConfig();
  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="split" role="img" aria-label="92 percent to the winner, 5 percent to the treasury, 3 percent to the season pool"><i /><i /><i /></div>
      <div className="legend">
        <span><i className="sw sw--gold" /><b>92%</b> to the winner</span>
        <span><i className="sw sw--royal" /><b>5%</b> protocol treasury</span>
        <span><i className="sw sw--sky" /><b>3%</b> weekly season top three</span>
      </div>
      {note && <p className="fine">A draw pays each side 46%. A house&apos;s share goes to its treasury.{config.data ? <> Treasury: <AddrLink address={config.data.treasury} />.</> : null}</p>}
    </div>
  );
}

export function Proof() {
  const me = useAccount((s) => s.device?.accountId ?? null);
  const totals = useTotals();
  const recent = useRecent(12);
  const t = totals.data;
  return (
    <div className="screen">
      <header className="screen-head">
        <div>
          <p className="eyebrow">On-chain proof</p>
          <h1 className="h1">Every result here was decided by the contract.</h1>
          <p className="lede">Read live from <a href={accountUrl(net.arena)} target="_blank" rel="noreferrer" className="mono">{net.arena}</a>. Open a settled match to replay its stored plays in your browser and compare the state hash with the referee&apos;s.</p>
        </div>
      </header>

      <div className="bignums" role="list" aria-label="Arena totals">
        <div role="listitem" className="bignum bignum--gold"><Big value={t?.settled} loading={totals.loading} error={totals.error} /><span className="label">Refereed on-chain</span></div>
        <div role="listitem" className="bignum bignum--sky"><Big value={t?.matches} loading={totals.loading} error={totals.error} /><span className="label">Matches staked</span></div>
        <div role="listitem" className="bignum bignum--jade"><Big value={t ? formatNear(t.volume) : undefined} unit="Ⓝ" loading={totals.loading} error={totals.error} /><span className="label">NEAR in pots</span></div>
        <div role="listitem" className="bignum bignum--royal"><Big value={t ? Number(t.refereed_ticks).toLocaleString('en-US') : undefined} loading={totals.loading} error={totals.error} /><span className="label">Ticks replayed</span></div>
      </div>

      <div className="proof-grid">
        <section className="card stack" aria-labelledby="recent-title">
          <div className="card-head"><h2 id="recent-title" className="h3">Recent matches</h2><span className="chip">from chain</span></div>
          {recent.loading ? <Loading label="Loading matches" lines={4} /> : recent.error ? <StateBox kind="error" title="Matches unavailable">{shortError(recent.error)}</StateBox>
            : !recent.data!.length ? <StateBox art title="No matches yet">The first staked match will appear here.</StateBox>
              : <ul className="mlist">{recent.data!.map((m) => <MatchCard key={m.id} m={m} me={me} />)}</ul>}
        </section>
        <div className="stack" style={{ gap: 16 }}>
          <section className="card stack" aria-labelledby="pot-title">
            <div className="card-head"><h2 id="pot-title" className="h3">Where a pot goes</h2><span className="chip chip--gold">Contract constants</span></div>
            <PotSplit note />
            {t && <p className="fine">Paid so far: <b className="num">{formatNear(t.to_treasury)} Ⓝ</b> to the treasury and <b className="num">{formatNear(t.season_paid)} Ⓝ</b> to season winners.</p>}
          </section>
          <section className="card stack" aria-labelledby="dep-title">
            <div className="card-head"><h2 id="dep-title" className="h3">Deployment</h2><Icon name="layers" /></div>
            <ul className="kv">
              <li><span>Arena</span><AddrLink address={net.arena} /></li>
              <li><span>Treasury</span><AddrLink address={deploymentInfo.treasury} /></li>
              <li><span>Relayer</span><AddrLink address={deploymentInfo.relayer} /></li>
              {deploymentInfo.deployTxs.slice(0, 4).map((d) => <li key={d.hash}><span>{d.step}</span><TxLink hash={d.hash} /></li>)}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
