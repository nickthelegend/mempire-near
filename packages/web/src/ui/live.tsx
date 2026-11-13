// SPDX-License-Identifier: MIT
// Liveness from real data: numbers that count up when the chain changes them, and a ticker of the latest card drops
// stored by the arena (get_plays on the newest matches, polled). Nothing here is simulated.
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import type { MatchView, Play } from '@mempire/sdk';
import { reader, useLive } from '../state/data';
import { fighter, shortAcct } from '../lib/fighters';
import { tickClock } from '../lib/match';
import { Avatar } from './kit';

const reduced = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** A number that eases from its last value to the new one (skipped with reduced motion). */
export function CountUp({ value, format = (n) => String(Math.round(n)), ms = 900 }: { value: number | null | undefined; format?: (n: number) => string; ms?: number }) {
  const [shown, setShown] = useState<number | null>(value ?? null);
  const from = useRef<number | null>(value ?? null);
  const [flash, setFlash] = useState(0);
  useEffect(() => {
    if (value == null) return;
    const start = from.current;
    from.current = value;
    if (start == null || start === value || reduced()) { setShown(value); return; }
    setFlash(Date.now());
    const t0 = performance.now();
    let raf = 0;
    const step = (now: number) => { const k = Math.min(1, (now - t0) / ms); const e = 1 - Math.pow(1 - k, 3); setShown(start + (value - start) * e); if (k < 1) raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  return <span className={`countup num${flash ? ' is-bumped' : ''}`} key={flash || undefined}>{shown == null ? '–' : format(shown)}</span>;
}

type DropRow = Play & { match: MatchView; key: string };

/** The latest card drops the arena has stored, newest first. */
export function useRecentPlays(matches = 4) {
  return useLive(async () => {
    const recent = (await reader.recent(matches)).filter((m) => m.plays0 + m.plays1 > 0);
    const rows: DropRow[] = [];
    for (const m of recent) {
      const plays = await reader.plays(m.id);
      plays.forEach((p, i) => rows.push({ ...p, match: m, key: `${m.id}:${i}` }));
    }
    return rows.sort((a, b) => Number(b.match.id) - Number(a.match.id) || b.tick - a.tick);
  }, [matches], 12000);
}

/** A moving strip of the latest on-chain card drops. */
export function PlaysTicker() {
  const plays = useRecentPlays();
  const rows = plays.data?.slice(0, 18) ?? [];
  if (plays.loading) return <div className="ticker ticker--loading" aria-busy>Reading the latest plays from the arena…</div>;
  if (plays.error) return <div className="ticker ticker--error">Plays unavailable: {plays.error.slice(0, 80)}</div>;
  if (!rows.length) return null;
  const item = (r: DropRow, dup = false) => {
    const fid = Number((r.seat === 0 ? r.match.deck0 : r.match.deck1)[r.deck_index]);
    const who = r.seat === 0 ? r.match.p0 : r.match.p1 ?? '';
    const lane = r.x < 9 * 1024 ? 'left' : 'right';
    return (
      <Link key={`${r.key}${dup ? 'd' : ''}`} to={`/app/match/${r.match.id}`} className="tick-item" tabIndex={dup ? -1 : undefined} aria-hidden={dup || undefined}>
        <Avatar id={fid} size={30} ring={r.seat === 0 ? 'gold' : 'crimson'} />
        <span><b>{fighter(fid).ticker}</b> {lane} lane · {shortAcct(who).split('.')[0]}</span>
        <small>#{r.match.id} · {tickClock(r.tick)}</small>
      </Link>
    );
  };
  return (
    <section className="ticker" aria-label="Latest card drops stored on chain">
      <span className="ticker-label"><span className="pulse" aria-hidden />Last plays on chain</span>
      <div className="ticker-track"><div className="ticker-belt">{rows.map((r) => item(r))}{rows.map((r) => item(r, true))}</div></div>
    </section>
  );
}

/** "read 4 s ago", ticking every second. */
export function Since({ at }: { at: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  if (!at) return <span>reading…</span>;
  const s = Math.max(0, Math.round((now - at) / 1000));
  return <span className="num">read {s < 60 ? `${s} s` : `${Math.floor(s / 60)} min`} ago</span>;
}
