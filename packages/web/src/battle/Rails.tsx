// SPDX-License-Identifier: MIT
// The panels beside the arena on wide screens (and in the Details sheet on phones): the rival, a live scoreboard read
// from the sim's own towers, the stake, and the chain feed. Everything here is read from the sim, the arena contract or
// this browser's own transactions; nothing is estimated.
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { formatNear, type MatchView } from '@mempire/sdk';
import type { SimState } from '@mempire/sim';
import { crownsTaken } from '../lib/match';
import { fighter, shortAcct } from '../lib/fighters';
import { houseArt, ART, OBJ3D } from '../lib/art';
import { Art, Avatar, BotAvatar, Icon, TxLink } from '../ui/kit';
import { useRecent, useTotals } from '../state/data';
import { HOUSE_ACCOUNTS } from '../state/history';

export type TxRow = { key: string; label: string; hash?: string; ms?: number; at?: number; fighterId?: number; state: 'sent' | 'ok' | 'in' | 'no' };

/** The rival: a big portrait, their name and what they are. */
export function FoeCard({ name, sub, art, bot, fighterId }: { name: string; sub: string; art: string | null; bot: boolean; fighterId?: number }) {
  return (
    <section className="rail-card foe-card" aria-label={`Rival: ${name}`}>
      <div className="foe-art">
        {art ? <Art src={art} alt="" eager fallback={<Icon name="castle" size={40} />} /> : bot ? <Art src={ART.practiceDummy} alt="" eager fallback={<BotAvatar size={96} />} /> : <Avatar id={fighterId ?? 0} size={120} ring="crimson" />}
      </div>
      <div className="foe-meta">
        <span className="foe-tag">Rival</span>
        <b className="foe-name">{name}</b>
        <span className="foe-sub">{sub}</span>
      </div>
    </section>
  );
}

function TowerBar({ hp, max, foe, king }: { hp: number; max: number; foe: boolean; king: boolean }) {
  const p = Math.max(0, hp) / max;
  return (
    <span className={`tbar${foe ? ' tbar--foe' : ''}${king ? ' tbar--king' : ''}${hp <= 0 ? ' tbar--down' : ''}`} title={`${king ? 'King keep' : 'Tower'}: ${Math.max(0, hp)} / ${max}`}>
      <i style={{ width: `${p * 100}%` }} />
      <b className="num">{hp <= 0 ? 'Down' : hp}</b>
    </span>
  );
}

/** Crowns and the three towers per side, straight from the sim. */
export function Scoreboard({ sim, seat, you, foe }: { sim: SimState | null; seat: 0 | 1; you: string; foe: string }) {
  if (!sim) return <section className="rail-card score"><p className="fine">The board appears when the match starts.</p></section>;
  const row = (owner: 0 | 1, label: string) => {
    const t = sim.towers.filter((x) => x.owner === owner);
    const crowns = crownsTaken(sim, owner);
    const isFoe = owner !== seat;
    return (
      <div className={`score-row${isFoe ? ' score-row--foe' : ''}`}>
        <div className="score-who"><span className="score-name">{label}</span><span className="score-crowns" aria-label={`${crowns} crowns`}>{[0, 1, 2].map((i) => <i key={i} className={i < crowns ? 'on' : ''}><Art src={OBJ3D.crown} fallback={<Icon name="crown" size={16} />} /></i>)}</span></div>
        <div className="score-towers">
          {t.filter((x) => x.kind === 'princess').map((x, i) => <TowerBar key={i} hp={x.hp} max={x.maxHp} foe={isFoe} king={false} />)}
          {t.filter((x) => x.kind === 'king').map((x, i) => <TowerBar key={`k${i}`} hp={x.hp} max={x.maxHp} foe={isFoe} king />)}
        </div>
      </div>
    );
  };
  return (
    <section className="rail-card score" aria-label="Scoreboard">
      <div className="rail-head"><h2 className="rail-title">Scoreboard</h2><span className="rail-note">Rush · most crowns in 30 s</span></div>
      {row((1 - seat) as 0 | 1, foe)}
      {row(seat, you)}
    </section>
  );
}

/** The stake: what is in the pot and where it goes, from the match record; or the practice note. */
export function PotCard({ match, practice }: { match: MatchView | null; practice: boolean }) {
  if (practice) return (
    <section className="rail-card pot pot--free">
      <Art className="pot-art" src={OBJ3D.cards} fallback={<Icon name="cards" size={36} />} />
      <div><b className="pot-big">Free practice</b><p className="fine">Same arena, same rules, nothing on chain. Stake a match and every card becomes a NEAR transaction.</p></div>
    </section>
  );
  if (!match) return null;
  const pot = BigInt(match.stake) * 2n;
  return (
    <section className="rail-card pot">
      <Art className="pot-art" src={OBJ3D.coin} fallback={<Icon name="crown" size={36} />} />
      <div className="pot-body">
        <span className="rail-note">Pot in escrow</span>
        <b className="pot-big num">{formatNear(pot)} <small>NEAR</small></b>
        <span className="fine">Winner takes 92% · {formatNear((pot * 92n) / 100n)} NEAR</span>
      </div>
    </section>
  );
}

function ago(ms: number, now: number) {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.floor(s / 60)}m ago` : s < 86400 ? `${Math.floor(s / 3600)}h ago` : `${Math.floor(s / 86400)}d ago`;
}

/** This match's transactions, newest first: every card drop is a `play` call from the match's session key. */
export function ChainFeed({ txs, settled }: { txs: TxRow[]; settled: boolean }) {
  const mine = txs.filter((t) => t.state !== 'in');
  const ok = mine.filter((t) => t.state === 'ok' && t.ms != null);
  const avg = ok.length ? Math.round(ok.reduce((a, t) => a + (t.ms ?? 0), 0) / ok.length) : null;
  return (
    <section className="rail-card feed" aria-label="On chain, live">
      <div className="rail-head"><h2 className="rail-title"><span className="pulse" aria-hidden />On chain, live</h2><span className="rail-note">NEAR testnet</span></div>
      <div className="feed-stats">
        <div><b className="num">{mine.filter((t) => t.hash).length}</b><span>transactions</span></div>
        <div><b className="num">{ok.length}</b><span>confirmed</span></div>
        <div><b className="num">{avg === null ? '–' : `${(avg / 1000).toFixed(1)}s`}</b><span>avg to land</span></div>
      </div>
      {txs.length === 0 ? <p className="fine feed-empty">{settled ? 'Every drop of this match is stored by the arena.' : 'Drag a card into a lane: each drop is signed by this match\'s play key and sent as a transaction. No pop-ups.'}</p> : (
        <ul className="feed-list">
          {[...txs].reverse().slice(0, 14).map((t) => (
            <li key={t.key} className={`feed-row feed-row--${t.state}`}>
              {t.fighterId !== undefined ? <Avatar id={t.fighterId} size={36} ring={t.state === 'in' ? 'crimson' : 'gold'} /> : <span className="feed-ico"><Icon name={t.state === 'no' ? 'x' : 'shield'} size={16} /></span>}
              <span className="feed-label">{t.label}</span>
              <span className="feed-state">
                {t.state === 'sent' ? <span className="st st--sent"><span className="spinner spinner--xs" />Sending</span>
                  : t.state === 'ok' ? <span className="st st--ok"><Icon name="check" size={12} />{t.ms != null ? `${(t.ms / 1000).toFixed(1)}s` : 'Done'}</span>
                    : t.state === 'no' ? <span className="st st--no">Refused</span> : <span className="st st--in">Rival</span>}
                {t.hash && <TxLink hash={t.hash}>{t.hash.slice(0, 6)}… ↗</TxLink>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** The arena right now: its counters and the latest matches, polled from the contract. New rows flash in. */
export function ArenaPulse({ title = 'Live on the arena' }: { title?: string }) {
  const recent = useRecent(6);
  const totals = useTotals();
  const seen = useRef<Set<string> | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  useEffect(() => {
    if (!recent.data) return;
    const ids = recent.data.map((m) => `${m.id}:${m.state}`);
    if (seen.current) { const n = new Set(ids.filter((i) => !seen.current!.has(i))); if (n.size) setFresh(n); }
    seen.current = new Set(ids);
  }, [recent.data]);
  return (
    <section className="rail-card pulse-card" aria-label={title}>
      <div className="rail-head"><h2 className="rail-title"><span className="pulse" aria-hidden />{title}</h2><span className="rail-note">polled every 15 s</span></div>
      <div className="feed-stats">
        <div><b className="num">{totals.data ? totals.data.settled : '–'}</b><span>refereed</span></div>
        <div><b className="num">{totals.data ? formatNear(totals.data.volume, 2) : '–'}</b><span>NEAR staked</span></div>
        <div><b className="num">{totals.data ? (Number(totals.data.refereed_ticks) / 20 / 60).toFixed(0) : '–'}</b><span>min replayed</span></div>
      </div>
      {recent.loading ? <p className="fine"><span className="spinner spinner--xs" /> Reading the arena…</p> : recent.error ? <p className="fine warn">Arena unreachable: {recent.error.slice(0, 80)}</p> : (
        <ul className="feed-list">
          {recent.data!.map((m) => {
            const houseSide = m.p1 && HOUSE_ACCOUNTS.has(m.p1);
            const p1 = m.p1 ? (houseSide ? m.p1.split('.')[0].replace(/^./, (c) => c.toUpperCase()) : shortAcct(m.p1).split('.')[0]) : 'open seat';
            const won = m.state === 3 ? (m.winner === 2 ? 'Draw' : `${m.winner === 0 ? shortAcct(m.p0).split('.')[0] : p1} won`) : m.state === 2 ? 'Playing now' : m.state === 1 ? 'Waiting' : 'Refunded';
            const at = Number(m.state === 3 ? m.settled_ms : m.created_ms);
            return (
              <li key={m.id} className={`feed-row${fresh.has(`${m.id}:${m.state}`) ? ' is-fresh' : ''}`}>
                <Avatar id={m.deck0[0] ?? 0} size={34} ring={m.winner === 0 && m.state === 3 ? 'gold' : undefined} />
                <span className="feed-label"><span><Link to={`/app/match/${m.id}`}>#{m.id}</Link> {shortAcct(m.p0).split('.')[0]} vs {p1}</span><small>{won} · {formatNear(BigInt(m.stake) * 2n)} NEAR pot</small></span>
                <span className="feed-state"><span className={`st ${m.state === 2 ? 'st--sent' : m.state === 3 ? 'st--ok' : ''}`}>{m.state === 2 ? 'Live' : ago(at, now)}</span></span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** Your eight, in cycle order: the four in hand, the next card, then the rest. Read from the sim. */
export function DeckCycle({ sim, seat }: { sim: SimState | null; seat: 0 | 1 }) {
  if (!sim) return null;
  const p = sim.players[seat];
  return (
    <section className="rail-card cycle" aria-label="Your deck in cycle order">
      <div className="rail-head"><h2 className="rail-title">Your deck</h2><span className="rail-note">hand · next · queue</span></div>
      <div className="cycle-row">
        {p.cycle.map((slot, i) => (
          <span key={slot} className={`cycle-slot${i < 4 ? ' is-hand' : i === 4 ? ' is-next' : ''}`} title={`${p.deck[slot].name}${i < 4 ? ' · in hand' : i === 4 ? ' · next' : ''}`}>
            <Avatar id={p.deck[slot].fighterId} size={38} ring={i < 4 ? 'gold' : undefined} />
          </span>
        ))}
      </div>
    </section>
  );
}

export const tickerOf = (id: number) => fighter(id).ticker;
export { houseArt };
