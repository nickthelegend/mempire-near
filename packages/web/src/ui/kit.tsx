import { useEffect, useState, type ReactNode } from 'react';
import { accountUrl, txUrl } from '../lib/net';
import { artOf, characterOf, costOf, fighter, pct, rarityOf, shortAcct, CLASS_NAMES } from '../lib/fighters';
import { ART } from '../lib/art';
import type { PulseState } from '../state/market';

/* ── Icons: chunky line glyphs drawn here ──────────────────────────────── */
export type IconName = 'swords' | 'cards' | 'trophy' | 'scroll' | 'flame' | 'lock' | 'out' | 'wallet' | 'clock' | 'check' | 'x'
  | 'share' | 'replay' | 'shield' | 'up' | 'down' | 'play' | 'pause' | 'crown' | 'bolt' | 'key' | 'mail' | 'cpu' | 'layers' | 'arrow'
  | 'castle' | 'chevL' | 'chevR' | 'drop' | 'user';
const PATHS: Record<IconName, ReactNode> = {
  swords: <><path d="M4 4l9 9M4 4h4M4 4v4" /><path d="M20 4l-9 9M20 4h-4M20 4v4" /><path d="M7 17l-3 3M17 17l3 3M9 15l-2 2M15 15l2 2" /></>,
  cards: <><rect x="3" y="5" width="11" height="15" rx="2" /><path d="M10 4.5l7.5-1.4a2 2 0 0 1 2.3 1.6l2 10.9a2 2 0 0 1-1.6 2.3L17 18.6" /></>,
  trophy: <><path d="M8 4h8v5a4 4 0 0 1-8 0V4z" /><path d="M8 6H4v1a3 3 0 0 0 4 3M16 6h4v1a3 3 0 0 1-4 3M12 13v4M8 20h8M9 17h6" /></>,
  scroll: <><path d="M6 4h11a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H8" /><path d="M6 4a2 2 0 0 0-2 2v1h4V6a2 2 0 0 0-2-2zM8 20a2 2 0 0 1-2-2V7M10 9h6M10 13h6M10 17h3" /></>,
  flame: <path d="M12 3c1 3 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5 0 2 1 3 2 3 0-3-1-5 1-8.5z" />,
  lock: <><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
  out: <><path d="M14 4h6v6M20 4l-9 9" /><path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" /></>,
  wallet: <><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M3 9h18M16 14h2" /></>,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5l3 2" /></>,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  share: <><path d="M12 15V3M7 8l5-5 5 5" /><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" /></>,
  replay: <><path d="M4 12a8 8 0 1 0 2.4-5.7" /><path d="M4 4v4h4" /><path d="M10 9l5 3-5 3V9z" /></>,
  shield: <><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z" /><path d="M8.5 12l2.5 2.5 4.5-5" /></>,
  up: <path d="M6 15l6-6 6 6" />,
  down: <path d="M6 9l6 6 6-6" />,
  play: <path d="M7 4.5v15l12-7.5-12-7.5z" />,
  pause: <path d="M8 5v14M16 5v14" />,
  crown: <path d="M3 18h18M4 8l4 4 4-7 4 7 4-4-1.5 10h-13L4 8z" />,
  bolt: <path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" />,
  key: <><circle cx="8" cy="15" r="4" /><path d="M11 12l9-9M16 7l3 3M14 9l2 2" /></>,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></>,
  cpu: <><rect x="6" y="6" width="12" height="12" rx="2" /><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4" /></>,
  layers: <><path d="M12 3l9 5-9 5-9-5 9-5z" /><path d="M3 13l9 5 9-5" /></>,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  castle: <><path d="M4 21V9h3V6h2v3h6V6h2v3h3v12z" /><path d="M10 21v-5a2 2 0 0 1 4 0v5M4 13h16" /></>,
  chevL: <path d="M15 5l-7 7 7 7" />,
  chevR: <path d="M9 5l7 7-7 7" />,
  drop: <path d="M12 3c3.5 4.5 6 7.6 6 11a6 6 0 0 1-12 0c0-3.4 2.5-6.5 6-11z" />,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" /></>,
};
export function Icon({ name, size = 20, title }: { name: IconName; size?: number; title?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden={title ? undefined : true} role={title ? 'img' : undefined}>
      {title && <title>{title}</title>}
      {PATHS[name]}
    </svg>
  );
}

/**
 * An art image with a designed fallback: until the file exists (or if it fails), the fallback renders in its
 * place, so a missing render reads as a deliberate placeholder, never as a broken image.
 */
export function Art({ src, alt = '', className = '', fallback, eager, width, height }: {
  src: string; alt?: string; className?: string; fallback?: ReactNode; eager?: boolean; width?: number; height?: number;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  if (failed) return <span className={`art-ph ${className}`} role={alt ? 'img' : undefined} aria-label={alt || undefined} aria-hidden={alt ? undefined : true}>{fallback}</span>;
  return <img className={className} src={src} alt={alt} aria-hidden={alt ? undefined : true} draggable={false} decoding="async"
    loading={eager ? 'eager' : 'lazy'} fetchPriority={eager ? 'high' : undefined} width={width} height={height} onError={() => setFailed(true)} />;
}

/** The Mempire crest. */
export function BrandMark({ size = 40 }: { size?: number }) {
  return (
    <span className="brand-mark" style={{ width: size, height: size, fontSize: size }}>
      <Art src={ART.logo} width={size} height={size} eager fallback={<span className="brand-mark-ph">M</span>} />
    </span>
  );
}

/** The chunky MEMPIRE wordmark, drawn in type; the generated logo replaces it once it exists. */
export function Wordmark({ small }: { small?: boolean }) {
  return <span className={`wordmark${small ? ' wordmark--sm' : ''}`} aria-label="Mempire"><span aria-hidden>MEMPIRE</span></span>;
}

/** Crest plus wordmark: the full Mempire lock-up. */
export function Logo({ small }: { small?: boolean }) {
  return (
    <span className={`logo${small ? ' logo--sm' : ''}`}>
      <Art className="logo-crest" src={ART.logo} eager fallback={<span />} />
      <Wordmark small={small} />
    </span>
  );
}

/* ── Market chips ──────────────────────────────────────────────────────── */
export function MoveChip({ statBps, state, small }: { statBps: number | null | undefined; state?: PulseState | 'stored' | null; small?: boolean }) {
  const sm = small ? ' move--sm' : '';
  if (state === 'house') return <span className={`move move--flat${sm}`} title="House fighter: no price, always neutral">House</span>;
  if (state === 'stale') return <span className={`move move--flat${sm}`} title="Relayer price older than 6 h: neutral">Stale</span>;
  if (state === 'noprice') return <span className={`move move--flat${sm}`} title="No signed price yet: neutral">No price</span>;
  if (statBps == null) return <span className={`move move--flat${sm}`} aria-label="Market loading">…</span>;
  const dir = statBps > 0 ? 'up' : statBps < 0 ? 'down' : 'flat';
  return (
    <span className={`move move--${dir}${sm}`} title="Stat change: twice the 24 h move (relayer price, testnet), capped at ±15%">
      {dir !== 'flat' && <Icon name={dir === 'up' ? 'up' : 'down'} size={small ? 11 : 13} />}{pct(statBps)}
    </span>
  );
}

/** The fallback for a fighter render: its ticker on the card's own colour. */
const FighterPh = ({ id }: { id: number }) => <span className="fighter-ph">{fighter(id).ticker.slice(0, 1)}</span>;

/* ── Fighter cards ─────────────────────────────────────────────────────── */
export function FighterCard({
  id, size = 'md', picked, locked, lockText, statBps, pulse, onClick, disabled, label, className, showName = true,
}: {
  id: number; size?: 'xs' | 'sm' | 'md' | 'lg'; picked?: boolean; locked?: boolean; lockText?: string;
  statBps?: number | null; pulse?: PulseState | 'stored' | null; onClick?: () => void; disabled?: boolean;
  label?: string; className?: string; showName?: boolean;
}) {
  const f = fighter(id);
  const rarity = rarityOf(id, statBps);
  const small = size === 'xs' || size === 'sm';
  const tone = statBps != null && f.kind !== 'house' ? (statBps > 0 ? ' fcard--buff' : statBps < 0 ? ' fcard--nerf' : '') : '';
  const body = (
    <>
      <span className="fcard-bg" aria-hidden />
      <Art className="fcard-art" src={artOf(id)} fallback={<FighterPh id={id} />} />
      <span className="fcard-cost" aria-hidden><span>{costOf(id)}</span></span>
      {(statBps !== undefined || pulse) && f.kind !== 'house' && size !== 'xs' && <span className="fcard-move"><MoveChip statBps={statBps} state={pulse} small={small} /></span>}
      {showName && (
        <span className="fcard-plate">
          <span className="fcard-ticker">{f.ticker}</span>
          {!small && <span className="fcard-sub">{characterOf(id)}</span>}
        </span>
      )}
      {locked && <span className="fcard-lock"><Icon name="lock" size={small ? 14 : 18} /><span>{lockText ?? 'Locked'}</span></span>}
      {picked && <span className="fcard-picked" aria-hidden><Icon name="check" size={small ? 12 : 16} /></span>}
    </>
  );
  const cls = `fcard fcard--${size} fcard--${rarity}${tone}${locked ? ' fcard--locked' : ''}${picked ? ' fcard--picked' : ''}${className ? ` ${className}` : ''}`;
  const aria = label ?? `${f.ticker}, ${characterOf(id)}, ${CLASS_NAMES[f.archetype]}, costs ${costOf(id)}`;
  if (onClick) return <button type="button" className={cls} onClick={onClick} disabled={disabled} aria-pressed={picked} aria-label={aria}>{body}</button>;
  return <div className={cls} role="img" aria-label={aria}>{body}</div>;
}

/** A round portrait: the head and shoulders of the fighter's full-body render. */
export function Avatar({ id, size = 40, ring }: { id: number; size?: number; ring?: 'gold' | 'jade' | 'crimson' }) {
  return (
    <span className={`avatar${ring ? ` avatar--${ring}` : ''}`} style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}>
      <Art src={artOf(id)} eager fallback={<span className="avatar-ph">{fighter(id).ticker.slice(0, 1)}</span>} />
    </span>
  );
}

/* ── States ────────────────────────────────────────────────────────────── */
export function Loading({ lines = 2, label }: { lines?: number; label: string }) {
  return (
    <div role="status" aria-label={label} className="stack" style={{ gap: 8 }}>
      {Array.from({ length: lines }, (_, i) => <div key={i} className="skeleton" style={{ height: 16, width: `${92 - i * 18}%` }} />)}
      <span className="sr-only">{label}</span>
    </div>
  );
}
export function StateBox({ kind = 'empty', title, children, action, art }: {
  kind?: 'empty' | 'error' | 'setup'; title: string; children?: ReactNode; action?: ReactNode; art?: boolean;
}) {
  return (
    <div className={`state state--${kind}${art ? ' state--art' : ''}`} role={kind === 'error' ? 'alert' : undefined}>
      {art && <Art className="state-art" src={ART.chest} fallback={<Icon name="castle" size={36} />} />}
      {!art && <span className="state-ico" aria-hidden><Icon name={kind === 'error' ? 'x' : kind === 'setup' ? 'key' : 'castle'} size={18} /></span>}
      <div className="stack" style={{ gap: 4, flex: 1, minWidth: 0 }}>
        <div className="state-title">{title}</div>
        {children && <div className="fine">{children}</div>}
        {action && <div style={{ marginTop: 8 }}>{action}</div>}
      </div>
    </div>
  );
}

/* ── Chain links ───────────────────────────────────────────────────────── */
export function TxLink({ hash, children }: { hash: string; children?: ReactNode }) {
  const text = children ?? `${hash.slice(0, 8)}…${hash.slice(-4)}`;
  return <a className="mono" href={txUrl(hash)} target="_blank" rel="noreferrer">{text}</a>;
}
export function AddrLink({ address, full }: { address: string; full?: boolean }) {
  return <a className="mono addr" href={accountUrl(address)} target="_blank" rel="noreferrer" title={address}>{full ? address : shortAcct(address)}</a>;
}

/** `to` in unix seconds. */
export function Countdown({ to, prefix }: { to: number; prefix?: string }) {
  const [now, setNow] = useState(() => Date.now() / 1000);
  useEffect(() => { const t = setInterval(() => setNow(Date.now() / 1000), 1000); return () => clearInterval(t); }, []);
  const left = Math.max(0, Math.floor(to - now));
  const d = Math.floor(left / 86400), h = Math.floor((left % 86400) / 3600), m = Math.floor((left % 3600) / 60), s = left % 60;
  const text = left === 0 ? 'ended' : d > 0 ? `${d}d ${h}h ${m}m` : h > 0 ? `${h}h ${m}m` : `${m}:${String(s).padStart(2, '0')}`;
  return <span className="num">{prefix}{text}</span>;
}

/** A big number with a faded unit; shows a skeleton while loading and "n/a" on error. */
export function Big({ value, unit, loading, error, tone }: { value?: string; unit?: string; loading?: boolean; error?: string | null; tone?: 'gold' | 'ember' | 'sapphire' | 'ivory' | 'jade' }) {
  return (
    <span className={`big big--${tone ?? 'ivory'}`}>
      {loading ? <span className="skeleton" style={{ display: 'inline-block', width: 84, height: '0.8em' }} /> : error ? <span title={error}>n/a</span> : value}
      {unit && <small>{unit}</small>}
    </span>
  );
}

/** Three crown slots, lit for each crown a side took. */
export function Crowns({ n, side = 'blue', size = 34 }: { n: number; side?: 'blue' | 'red'; size?: number }) {
  return (
    <span className={`crowns3 crowns3--${side}`} role="img" aria-label={`${n} of 3 crowns`}>
      {[0, 1, 2].map((i) => (
        <span key={i} className={`crown3${i < n ? ' is-on' : ''}`} style={{ width: size, height: size, ['--i' as string]: i }}>
          <Art src={ART.crown} fallback={<Icon name="crown" size={Math.round(size * 0.7)} />} />
        </span>
      ))}
    </span>
  );
}
