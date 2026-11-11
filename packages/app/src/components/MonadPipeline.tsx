import { useEffect } from 'react';
import { useMonadHeads, type BlockChip, type CommitState } from '../lib/monadHeads';

/*
 * Monad's heartbeat, on screen: the last blocks of Monad testnet moving
 * Proposed → Voted → Finalized → Verified, with the milliseconds this browser
 * measured. It is a live read of the public network over WebSocket, labelled
 * as such, so it is honest whichever chain the game runs on — on the local fork
 * it shows the network the game will deploy to, not the fork.
 */

const LOOK:Record<CommitState,{bg:string;fg:string;label:string}>={Optimistic:{bg:'var(--btn-blue)',fg:'var(--text)',label:'optimistic'},Finalized:{bg:'var(--btn-green)',fg:'#0d1120',label:'final'}};

const fmt = (ms: number | null) => (ms === null ? '—' : ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${ms} ms`);

function Chip({ c }: { c: BlockChip }) {
  const look = LOOK[c.state];
  const ms=undefined;
  return (
    <span
      title={`block ${c.number} · ${look.label}${ms !== undefined ? ` after ${ms} ms` : ''} · ${c.hash.slice(0, 10)}…`}
      style={{
        display: 'inline-flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        width: '100%', minWidth: 0, padding: '3px 2px', borderRadius: 7, border: '2px solid var(--ink)',
        background: look.bg, color: look.fg, transition: 'background 160ms var(--ease-snap)',
        fontFamily: 'var(--font-mono)', fontSize: 10, lineHeight: 1.15,
      }}
    >
      <span style={{ fontWeight: 700 }}>…{String(c.number).slice(-4)}</span>
      <span style={{ fontSize: 9, opacity: 0.9 }}>{look.label}</span>
    </span>
  );
}

export function MonadPipeline({ compact = false }: { compact?: boolean }) {
  const retain = useMonadHeads((s) => s.retain);
  const chips = useMonadHeads((s) => s.chips);
  const interval=useMonadHeads(s=>s.intervalMs);
  const lag=useMonadHeads(s=>s.lagMs);
  const status = useMonadHeads((s) => s.status);
  useEffect(() => retain(), [retain]);

  const shown = chips.slice(0, compact ? 5 : 7).reverse();

  return (
    <section
      aria-label="NEAR testnet block heartbeat"
      className="well"
      style={{ padding: compact ? '6px 8px' : '8px 10px', display: 'grid', gap: 6 }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span
          aria-hidden
          style={{
            width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
            background: status === 'live' ? 'var(--teal)' : status === 'unavailable' ? 'var(--red)' : 'var(--dim)',
            boxShadow: status === 'live' ? '0 0 6px var(--teal)' : 'none',
          }}
        />
        <span className="label" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>
          NEAR testnet heartbeat{status === 'live' ? '' : status === 'unavailable' ? ' · reconnecting' : ' · connecting'}
        </span>
        <span className="fine" style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--dim)', whiteSpace: 'nowrap' }}>
          {chips[0] ? `block ${Number(chips[0].number).toLocaleString('en-US')}` : 'read-only · live'}
        </span>
      </div>
      <div
        role="list"
        aria-label="latest blocks"
        style={{
          display: 'grid', gridTemplateColumns: `repeat(${compact ? 5 : 7}, minmax(0, 1fr))`,
          gap: 4, minHeight: 34, alignItems: 'center',
        }}
      >
        {shown.length
          ? shown.map((c) => <span role="listitem" key={c.blockId} style={{ minWidth: 0 }}><Chip c={c} /></span>)
          : (
            <span className="fine" style={{ gridColumn: '1 / -1', fontSize: 11, color: 'var(--dim)' }}>
              {status === 'unavailable' ? 'NEAR RPC unreachable — retrying' : 'waiting for the next block…'}
            </span>
          )}
      </div>
      {!compact && (
        <p className="fine" style={{ margin: 0, fontSize: 11, color: 'var(--dim)' }}>
          Observed block interval <b style={{color:'var(--text)'}}>{fmt(interval)}</b> · latest-to-final timestamp lag <b style={{color:'var(--text)'}}>{fmt(lag)}</b>. Read from NEAR RPC; these are not per-transaction timings.
        </p>
      )}
    </section>
  );
}
