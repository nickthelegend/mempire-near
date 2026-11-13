// SPDX-License-Identifier: MIT
import { pct, shortError } from '../lib/fighters';
import { useMarket } from '../state/market';
import { Avatar, Icon, MoveChip } from './kit';

export const money = (n: number | null) => (n === null ? '' : `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: n < 10 ? 4 : 2 })}`);
export const ago = (sec: number) => { const m = Math.max(0, Math.round((Date.now() / 1000 - sec) / 60)); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`; };

/** Marquee of every market fighter's 24 h move and the stat change it becomes at kick-off. */
export function MarketTicker() {
  const m = useMarket();
  const priced = m.list.filter((p) => p.state !== 'house');
  return (
    <section className="ticker" aria-label="Market: 24 hour moves priced by the OutLayer TEE oracle and the stat change each becomes">
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
