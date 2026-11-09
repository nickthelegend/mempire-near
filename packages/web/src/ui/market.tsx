// SPDX-License-Identifier: MIT
import { fighter, pct, shortError } from '../lib/fighters';
import { PULSE_LABEL, useMarket, type Pulse } from '../state/market';
import { Avatar, Icon, Loading, MoveChip, StateBox } from './kit';

export const money = (n: number | null) => (n === null ? '' : `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: n < 10 ? 4 : 2 })}`);
export const ago = (sec: number) => { const m = Math.max(0, Math.round((Date.now() / 1000 - sec) / 60)); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`; };

/** Marquee of every market fighter's 24 h move and the stat change it becomes at kick-off. */
export function MarketTicker() {
  const m = useMarket();
  const priced = m.list.filter((p) => p.state !== 'house');
  return (
    <section className="ticker" aria-label="Market: 24 hour moves from the signed relayer price and the stat change each becomes">
      <div className="ticker-head"><Icon name="bolt" size={16} />Market</div>
      {m.loading && !priced.length ? <div className="ticker-track ticker-track--still"><span className="tick">Reading the arena&apos;s prices…</span></div>
        : m.error && !priced.length ? <div className="ticker-track ticker-track--still"><span className="tick tick--err">Prices unavailable: {shortError(m.error, 60)}</span></div>
          : (
            <div className="ticker-track">
              {[0, 1].map((copy) => (
                <div key={copy} className="ticker-copy" aria-hidden={copy === 1}>
                  {[...priced].sort((a, b) => (b.moveBps ?? -1e9) - (a.moveBps ?? -1e9)).map((p) => (
                    <span key={p.fighterId} className="tick">
                      <Avatar id={p.fighterId} size={26} />
                      <b>{p.ticker}</b>
                      <span className="px num">{money(p.price)}</span>
                      {p.moveBps !== null && <span className={`num ${p.moveBps >= 0 ? 'up' : 'down'}`}>{pct(p.moveBps, 2)}</span>}
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
      <Avatar id={p.fighterId} size={40} ring={p.statBps > 0 ? 'jade' : p.statBps < 0 ? 'crimson' : undefined} />
      <div style={{ minWidth: 0 }}>
        <div className="t">{f.ticker} <span className="fine">{f.name}</span></div>
        <div className="s num">{money(p.price)}{p.moveBps !== null ? <> · <span className={p.moveBps >= 0 ? 'up' : 'down'}>{pct(p.moveBps, 2)}</span> 24 h</> : ` · ${PULSE_LABEL[p.state]}`}</div>
      </div>
      <MoveChip statBps={p.statBps} state={p.state} />
    </li>
  );
}

/** The arena's signed prices, best buff first. */
export function PulseList() {
  const m = useMarket();
  const priced = m.list.filter((p) => p.state !== 'house').sort((a, b) => b.statBps - a.statBps || (b.moveBps ?? 0) - (a.moveBps ?? 0));
  const newest = Math.max(0, ...priced.map((p) => p.updatedAt));
  return (
    <>
      {m.loading && !priced.length ? <Loading label="Reading prices" lines={4} />
        : m.error && !priced.length ? <StateBox kind="error" title="Prices unavailable">{shortError(m.error)}</StateBox>
          : <ul className="pulse-list">{priced.map((p) => <PulseRow key={p.fighterId} p={p} />)}</ul>}
      <p className="fine">Coinbase 24 h stats, signed by the relayer key and verified by the arena. At kick-off each fighter gets twice its move, capped at ±15%.{newest ? ` Posted ${ago(newest)}.` : ''}</p>
    </>
  );
}
