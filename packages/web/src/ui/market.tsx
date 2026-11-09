import { Link } from 'react-router';
import { fighter, pct, shortError } from '../lib/fighters';
import { PULSE_LABEL, useMarket, type Pulse } from '../state/market';
import { useBurnStats, useSeason } from '../state/data';
import { formatWif } from '../state/format';
import { Avatar, Big, Countdown, Icon, Loading, MoveChip, StateBox } from './kit';
import { ZERO, shortAddr } from '../lib/fighters';
import { useWalletStore } from '../state/wallet';

const money = (n: number | null) => (n === null ? '' : `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

/** Market Pulse marquee: every priced fighter's live 24 h move and the stat change it becomes at kick-off. */
export function MarketTicker() {
  const m = useMarket();
  const priced = m.list.filter((p) => p.state !== 'house');
  return (
    <section className="ticker" aria-label="Market Pulse: today's 24 hour moves from Chainlink and the stat change each becomes">
      <div className="ticker-head"><Icon name="bolt" size={16} />Market Pulse</div>
      {m.loading && !priced.length ? <div className="ticker-track" style={{ animation: 'none' }}><span className="tick fine">Reading 15 Chainlink feeds…</span></div>
        : m.error && !priced.length ? <div className="ticker-track" style={{ animation: 'none' }}><span className="tick" style={{ color: '#ff9cb0' }}>Chainlink feeds unavailable right now</span></div>
          : (
            <div className="ticker-track">
              {[0, 1].map((copy) => (
                <div key={copy} style={{ display: 'flex' }} aria-hidden={copy === 1}>
                  {[...priced].sort((a, b) => (b.moveBps ?? -1e9) - (a.moveBps ?? -1e9)).map((p) => (
                    <span key={p.fighterId} className="tick">
                      <b>{p.ticker}</b>
                      <span className="px">{money(p.price)} {p.moveBps !== null && <span className={p.moveBps >= 0 ? 'up' : 'down'}>{pct(p.moveBps, 2)}</span>}</span>
                      <MoveChip statBps={p.statBps} state={p.state} small />
                    </span>
                  ))}
                </div>
              ))}
            </div>
          )}
    </section>
  );
}

export function PulseRow({ p }: { p: Pulse }) {
  const f = fighter(p.fighterId);
  return (
    <li className="pulse-row">
      <Avatar id={p.fighterId} size={36} ring={p.statBps > 0 ? 'jade' : p.statBps < 0 ? 'crimson' : undefined} />
      <div style={{ minWidth: 0 }}>
        <div className="t">{f.ticker}</div>
        <div className="s">{money(p.price)}{p.moveBps !== null ? <> · <span className={p.moveBps >= 0 ? 'up' : 'down'}>{pct(p.moveBps, 2)}</span> 24 h</> : ` · ${PULSE_LABEL[p.state]}`}</div>
      </div>
      <MoveChip statBps={p.statBps} state={p.state} />
    </li>
  );
}

/** Desktop left panel: the full Market Pulse. */
export function MarketPanel() {
  const m = useMarket();
  const priced = m.list.filter((p) => p.state !== 'house').sort((a, b) => b.statBps - a.statBps || (b.moveBps ?? 0) - (a.moveBps ?? 0));
  const live = priced.filter((p) => p.state === 'live').length;
  return (
    <section className="panel stack" aria-labelledby="mp-title">
      <div className="panel-head">
        <h2 id="mp-title" className="side-title">Market Pulse</h2>
        <span className={`chip ${live ? 'chip--live' : ''}`}>{m.loading && !priced.length ? 'Reading' : `${live} live`}</span>
      </div>
      <p className="fine">Chainlink 24 h move per fighter. At kick-off the arena stores twice the move as its stat change, capped at ±15%. Closed markets are neutral.</p>
      {m.loading && !priced.length ? <Loading label="Reading Chainlink feeds" lines={6} />
        : m.error && !priced.length ? <StateBox kind="error" title="Feeds unavailable">{shortError(m.error)}</StateBox>
          : <ul className="pulse-list">{priced.map((p) => <PulseRow key={p.fighterId} p={p} />)}</ul>}
    </section>
  );
}

const SHARES = [5000n, 3000n, 2000n];
/** Desktop right panel: the season as a race, and the burn. */
export function SeasonPanel() {
  const address = useWalletStore((s) => s.address);
  const season = useSeason(address);
  const burn = useBurnStats();
  const info = season.data?.info;
  const top = info ? info[2].map((p) => Number(p)) : [];
  const max = Math.max(1, ...top);
  return (
    <>
      <section className="panel stack" aria-labelledby="sr-title">
        <div className="panel-head">
          <h2 id="sr-title" className="side-title">Season {season.data?.current ?? '…'}</h2>
          {season.data && <span className="chip chip--sapphire"><Icon name="clock" size={14} /><Countdown to={season.data.end} /></span>}
        </div>
        {season.loading ? <Loading label="Loading the season" lines={3} /> : season.error ? <StateBox kind="error" title="Season unavailable">{season.error}</StateBox> : info && (
          <>
            <div><span className="label">Prize pool</span><div><Big value={formatWif(info[0], 0)} unit="WIF" tone="sapphire" /></div></div>
            <ol className="race" aria-label="Top three">
              {[0, 1, 2].map((i) => {
                const who = info[1][i];
                const empty = who === ZERO;
                const you = !empty && who.toLowerCase() === address?.toLowerCase();
                return (
                  <li key={i} className="race-row" data-rank={i + 1} data-you={you}>
                    <span className="race-rank">{i + 1}</span>
                    <div className="race-bar"><i style={{ width: empty ? '0%' : `${(Number(info[2][i]) / max) * 100}%` }} /><span>{empty ? <span className="fine">Open seat</span> : <>{you ? 'You' : shortAddr(who)} <span className="fine">{info[2][i].toString()} pts</span></>}</span></div>
                    <span className="num" style={{ fontWeight: 700, fontSize: 13, color: 'var(--sapphire)' }}>{formatWif((info[0] * SHARES[i]) / 10000n, 0)}</span>
                  </li>
                );
              })}
            </ol>
            <Link to="/ladder" className="key key--ghost key--sm">Full season</Link>
          </>
        )}
      </section>
      <section className="panel stack" aria-labelledby="burn-title">
        <div className="panel-head"><h2 id="burn-title" className="side-title">Burned</h2><img src="/brand/v2/fx-burn.webp" width={40} height={40} alt="" aria-hidden style={{ objectFit: 'contain' }} /></div>
        <Big value={burn.data ? formatWif(burn.data.totalBurned, 0) : undefined} unit="WIF" tone="ember" loading={burn.loading} error={burn.error} />
        <p className="fine">5% of every settled pot, destroyed with <span className="mono">WIF.burn</span> in the settlement transaction.</p>
        {burn.data && burn.data.recent.length > 0 && (
          <ul className="list">
            {burn.data.recent.slice(0, 4).map((e) => (
              <li key={`${e.transactionHash}-${e.logIndex}`} className="list-row" style={{ gridTemplateColumns: '1fr auto' }}>
                <span className="s">{e.args.matchId === 0n ? 'Unclaimed season share' : `Match #${e.args.matchId?.toString()}`}</span>
                <span className="num" style={{ color: 'var(--ember-hi)', fontWeight: 700 }}>{formatWif(e.args.amount ?? 0n, 0)} WIF</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
