// SPDX-License-Identifier: MIT
import { Link } from 'react-router';
import { formatNear } from '@mempire/sdk';
import { fighter, pct, shortAcct, shortError } from '../lib/fighters';
import { PULSE_LABEL, useMarket, type Pulse } from '../state/market';
import { useHouses, useSeason } from '../state/data';
import { useAccount } from '../state/account';
import { Avatar, Big, Countdown, Icon, Loading, MoveChip, StateBox } from './kit';

const money = (n: number | null) => (n === null ? '' : `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: n < 10 ? 4 : 2 })}`);
const ago = (sec: number) => { const m = Math.max(0, Math.round((Date.now() / 1000 - sec) / 60)); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`; };

/** Marquee of every market fighter's 24 h move and the stat change it becomes at kick-off. */
export function MarketTicker() {
  const m = useMarket();
  const priced = m.list.filter((p) => p.state !== 'house');
  return (
    <section className="ticker" aria-label="Market Pulse: 24 hour moves from the signed relayer price and the stat change each becomes">
      <div className="ticker-head"><Icon name="bolt" size={16} />Market</div>
      {m.loading && !priced.length ? <div className="ticker-track" style={{ animation: 'none' }}><span className="tick fine">Reading the arena's prices…</span></div>
        : m.error && !priced.length ? <div className="ticker-track" style={{ animation: 'none' }}><span className="tick" style={{ color: '#ff9cb0' }}>Prices unavailable: {shortError(m.error, 60)}</span></div>
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
        <div className="t">{f.ticker} <span className="fine" style={{ fontWeight: 500 }}>{f.name}</span></div>
        <div className="s">{money(p.price)}{p.moveBps !== null ? <> · <span className={p.moveBps >= 0 ? 'up' : 'down'}>{pct(p.moveBps, 2)}</span> 24 h</> : ` · ${PULSE_LABEL[p.state]}`}</div>
      </div>
      <MoveChip statBps={p.statBps} state={p.state} />
    </li>
  );
}

/** Desktop left panel: the arena's signed prices. */
export function MarketPanel() {
  const m = useMarket();
  const priced = m.list.filter((p) => p.state !== 'house').sort((a, b) => b.statBps - a.statBps || (b.moveBps ?? 0) - (a.moveBps ?? 0));
  const live = priced.filter((p) => p.state === 'live').length;
  const newest = Math.max(0, ...priced.map((p) => p.updatedAt));
  return (
    <section className="panel stack" aria-labelledby="mp-title">
      <div className="panel-head">
        <h2 id="mp-title" className="side-title">Market</h2>
        <span className={`chip ${live ? 'chip--live' : ''}`}>{m.loading && !priced.length ? 'Reading' : `${live} live`}</span>
      </div>
      <p className="fine">Relayer price (testnet): Coinbase 24 h stats, signed by the relayer key and verified by the arena. At kick-off each fighter gets twice its move, capped at ±15%.{newest ? ` Posted ${ago(newest)}.` : ''}</p>
      {m.loading && !priced.length ? <Loading label="Reading prices" lines={5} />
        : m.error && !priced.length ? <StateBox kind="error" title="Prices unavailable">{shortError(m.error)}</StateBox>
          : <ul className="pulse-list">{priced.map((p) => <PulseRow key={p.fighterId} p={p} />)}</ul>}
    </section>
  );
}

const SHARES = [5000n, 3000n, 2000n];
/** Desktop right panel: the season race and the houses. */
export function SeasonPanel() {
  const me = useAccount((s) => s.device?.accountId ?? null);
  const season = useSeason(me);
  const houses = useHouses();
  const info = season.data?.info;
  const max = Math.max(1, ...(info?.top.map((t) => t.points) ?? [1]));
  return (
    <>
      <section className="panel stack" aria-labelledby="sr-title">
        <div className="panel-head">
          <h2 id="sr-title" className="side-title">Season {season.data?.current ?? '…'}</h2>
          {info && <span className="chip chip--sapphire"><Icon name="clock" size={14} /><Countdown to={Number(info.end_ms) / 1000} /></span>}
        </div>
        {season.loading ? <Loading label="Loading the season" lines={3} /> : season.error ? <StateBox kind="error" title="Season unavailable">{shortError(season.error)}</StateBox> : info && (
          <>
            <div><span className="label">Prize pool</span><div><Big value={formatNear(info.pool)} unit="NEAR" tone="sapphire" /></div></div>
            <ol className="race" aria-label="Top three">
              {[0, 1, 2].map((i) => {
                const t = info.top[i];
                const you = !!t && t.account === me;
                return (
                  <li key={i} className="race-row" data-rank={i + 1} data-you={you}>
                    <span className="race-rank">{i + 1}</span>
                    <div className="race-bar"><i style={{ width: t ? `${(t.points / max) * 100}%` : '0%' }} /><span>{!t ? 'Open seat' : `${you ? 'You' : shortAcct(t.account)} · ${t.points} pt${t.points === 1 ? '' : 's'}`}</span></div>
                    <span className="num" style={{ fontWeight: 700, fontSize: 13, color: 'var(--sapphire)' }}>{formatNear((BigInt(info.pool) * SHARES[i]) / 10000n)}</span>
                  </li>
                );
              })}
            </ol>
            <Link to="/app/season" className="key key--ghost key--sm">Full season</Link>
          </>
        )}
      </section>
      <section className="panel stack" aria-labelledby="house-title">
        <div className="panel-head"><h2 id="house-title" className="side-title">Houses</h2><span className="chip">{houses.data?.length ?? '…'} bots</span></div>
        {houses.loading ? <Loading label="Loading houses" lines={3} /> : houses.error ? <StateBox kind="error" title="Houses unavailable">{shortError(houses.error)}</StateBox> : (
          <ul className="list">
            {houses.data!.map((h) => (
              <li key={h.index} className="list-row" style={{ gridTemplateColumns: 'auto 1fr auto' }}>
                <Avatar id={h.deck[0]} size={30} />
                <span className="s"><b style={{ color: 'var(--text)' }}>{h.name}</b> · {h.wins}W {h.losses}L {h.draws}D</span>
                <span className="num" style={{ color: 'var(--gold-hi)', fontWeight: 700 }}>{formatNear(h.treasury, 2)} Ⓝ</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
