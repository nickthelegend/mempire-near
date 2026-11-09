// SPDX-License-Identifier: MIT
import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import {
  KeyPair, KeySigner, MatchRunner, replayFromChain, roster, formatNear, FORMAT_NAMES, TIER_NAMES, STATE_NAMES,
  type Claim, type MatchView, type RunnerEvent,
} from '@mempire/sdk';
import { Archetype, cloneState, createMatch, decideBot, FORMATS, FP, refereeStep, stepSim, traitFor, type InputEvent, type MatchCard, type SimState } from '@mempire/sim';
import { net } from '../lib/net';
import { useAccount, sessionKeyFor } from '../state/account';
import { useMatch } from '../state/battle';
import { useMarket, useMarketStore } from '../state/market';
import { chainChanged, reader } from '../state/data';
import { removeSession, settle } from '../lib/play';
import { costOf, fighter, pct, shortAcct, statusLabel, shortError } from '../lib/fighters';
import { BattleBoard, dropDecision } from '../battle/BattleBoard';
import { AddrLink, Avatar, Big, FighterCard, Icon, MoveChip, StateBox, TxLink } from '../ui/kit';

type TxRow = { key: string; label: string; hash?: string; ms?: number; state: 'sent' | 'ok' | 'in' | 'no' };
type Replay = Awaited<ReturnType<typeof replayFromChain>>;

const PRACTICE_YOU = [0, 1, 2, 3, 4, 5, 6, 8];
const PRACTICE_BOT = [0, 9, 2, 10, 4, 7, 3, 1];
function cards(ids: readonly number[], stat: (id: number) => number): MatchCard[] {
  return ids.map((id) => {
    const f = roster.fighters[id];
    return { fighterId: id, name: f.ticker, archetype: f.archetype as MatchCard['archetype'], trait: traitFor(f.ticker), level: 1, metaBps: stat(id) };
  });
}
const crownsTaken = (sim: SimState, by: 0 | 1) => {
  const enemy = sim.towers.filter((t) => t.owner !== by);
  const king = enemy.find((t) => t.kind === 'king');
  if (king && king.hp <= 0) return 3;
  return enemy.filter((t) => t.kind === 'princess' && t.hp <= 0).length;
};

export function Battle({ practice = false }: { practice?: boolean }) {
  const { id } = useParams();
  const matchId = practice ? null : id ?? null;
  const signer = useAccount((s) => s.signer);
  const me = useAccount((s) => s.device?.accountId ?? null);
  const market = useMarket();
  const sim = useMatch((s) => s.sim);
  const setSim = useMatch((s) => s.set);
  const resetSim = useMatch((s) => s.reset);
  useEffect(() => { resetSim(); return () => resetSim(); }, [resetSim, matchId]);
  const perspective = useMatch((s) => s.perspective);
  const [runner, setRunner] = useState<MatchRunner | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [txs, setTxs] = useState<TxRow[]>([]);
  const [claim, setClaim] = useState<Claim | null>(null);
  const [match, setMatch] = useState<MatchView | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [replay, setReplay] = useState<{ data: Replay; playing: boolean; speed: number; done: boolean } | null>(null);
  const [stripSide, setStripSide] = useState<'you' | 'foe'>('you');
  const practiceRef = useRef<{ sim: SimState; inputs: InputEvent[] } | null>(null);
  const replayRef = useRef<{ state: SimState; pending: InputEvent[] } | null>(null);
  const resultSound = useRef(false);
  const addTx = (row: TxRow) => setTxs((old) => [...old.filter((t) => t.key !== row.key).slice(-40), row]);

  // Practice: a local sim against the scripted bot with today's signed prices. Nothing touches the chain.
  const marketReady = !market.loading || !!market.error;
  useEffect(() => {
    if (!practice || !marketReady || practiceRef.current) return;
    const { byId } = useMarketStore.getState();
    const stat = (fid: number) => byId.get(fid)?.statBps ?? 0;
    const state = createMatch(Math.floor(Math.random() * 2 ** 32), [cards(PRACTICE_YOU, stat), cards(PRACTICE_BOT, stat)], FORMATS.rush);
    practiceRef.current = { sim: state, inputs: [] };
    setSim(state, 0);
  }, [practice, marketReady, setSim]);
  useEffect(() => {
    if (!practice) return;
    const t = setInterval(() => {
      const v = practiceRef.current;
      if (!v || v.sim.phase === 'ended') return;
      const input = decideBot(v.sim, 1, 'normal');
      if (input) v.inputs.push(input);
      stepSim(v.sim, v.inputs.filter((e) => e.tick === v.sim.tick));
      setSim(structuredClone(v.sim), 0);
    }, 50);
    return () => clearInterval(t);
  }, [practice, setSim]);
  useEffect(() => () => { practiceRef.current = null; }, []);

  // On-chain: the runner rebuilds the board from the arena's play log and sends ours from the session key.
  useEffect(() => {
    if (practice || !matchId) return;
    let active = true;
    let r: MatchRunner | null = null;
    void (async () => {
      try {
        const m = await reader.match(matchId);
        if (!active) return;
        if (!m) throw new Error(`Match #${matchId} does not exist on ${net.arena}`);
        setMatch(m);
        if (m.state !== 2) return;
        const seat: 0 | 1 = me && m.p1 === me && m.house === null ? 1 : 0;
        const isPlayer = !!me && (m.p0 === me || (m.house === null && m.p1 === me));
        const key = isPlayer ? sessionKeyFor(matchId) : null;
        const session = key ? new KeySigner(net.rpc, me!, KeyPair.fromString(key as never)) : null;
        if (isPlayer && !session) setError('This match\'s session key is not in this browser, so you can watch but not play here.');
        r = new MatchRunner({
          net, matchId, seat, session,
          settle: signer ? async (c: Claim) => {
            setBusy('Asking the referee to settle');
            try { await settle(signer, matchId, c, (s) => addTx({ key: s.hash ?? s.label, label: s.label, hash: s.hash, state: 'ok' })); }
            finally { setBusy(''); }
          } : undefined,
          onEvent: (e: RunnerEvent) => {
            if (!active) return;
            if (e.type === 'state') setSim(e.state, seat);
            else if (e.type === 'match') setMatch(e.match);
            else if (e.type === 'claim') setClaim(e.claim);
            else if (e.type === 'error') { console.warn('runner', e.error); setError(e.error.message); }
            else if (e.type === 'playSent') addTx({ key: e.hash, label: `You dropped slot ${e.deckIndex + 1} for tick ${e.tick}`, hash: e.hash, state: 'sent' });
            else if (e.type === 'playLanded') setTxs((old) => old.map((t) => (t.key === e.hash ? { ...t, state: 'ok', ms: e.ms } : t)));
            else if (e.type === 'playRefused') { console.warn('play refused', e.error); setTxs((old) => (old.some((t) => t.key === e.hash && e.hash) ? old.map((t) => (t.key === e.hash ? { ...t, state: 'no', label: `${t.label}: refused (${shortError(e.error, 60)})` } : t)) : [...old, { key: `r${Date.now()}`, label: `A drop was not sent: ${shortError(e.error, 80)}`, state: 'no' }])); }
            else if (e.type === 'opponentPlay') addTx({ key: `o${e.input.tick}-${e.input.deckIndex}-${Math.random()}`, label: `Opponent dropped slot ${e.input.deckIndex + 1} at tick ${e.input.tick}`, state: 'in' });
          },
        });
        await r.init();
        if (active) { setRunner(r); void r.run(); }
      } catch (e) { if (active) setError((e as Error).message); }
    })();
    return () => { active = false; r?.stop(); };
  }, [practice, matchId, me, signer, setSim]);

  // After settlement: refresh balances, delete the session key, play the result sound.
  const seat: 0 | 1 = match && me && match.p1 === me && match.house === null ? 1 : 0;
  const settled = match?.state === 3;
  useEffect(() => {
    if (!settled || !matchId || !signer) return;
    chainChanged();
    void removeSession(signer, matchId, (s) => addTx({ key: s.hash ?? s.label, label: s.label, hash: s.hash, state: 'ok' })).catch(() => {});
  }, [settled, matchId, signer]);
  useEffect(() => {
    if (!settled || resultSound.current || replay || !match || match.winner === 2) return;
    const mine = me && (match.p0 === me || match.p1 === me);
    if (!mine) return;
    resultSound.current = true;
    void new Audio(match.winner === seat ? '/sfx/sfx_victory.mp3' : '/sfx/sfx_defeat.mp3').play().catch(() => {});
  }, [settled, match, seat, me, replay]);

  // Replay from the chain's own log, house bot included.
  useEffect(() => {
    if (!replay?.playing) return;
    const t = setInterval(() => {
      const st = replayRef.current;
      if (!st) return;
      for (let i = 0; i < replay.speed && st.state.phase !== 'ended'; i++) refereeStep(st.state, replay.data.inputs, replay.data.house, st.pending);
      setSim(cloneState(st.state), seat);
      if (st.state.phase === 'ended') setReplay((r) => (r ? { ...r, playing: false, done: true } : r));
    }, 50);
    return () => clearInterval(t);
  }, [replay?.playing, replay?.speed, replay?.data, seat, setSim]);

  async function startReplay() {
    if (!matchId) return;
    setBusy('Rebuilding the match from chain');
    try {
      const data = await replayFromChain(net, matchId);
      replayRef.current = { state: cloneState(data.initial), pending: [] };
      setSim(cloneState(data.initial), seat);
      setReplay({ data, playing: true, speed: 2, done: false });
    } catch (e) { setError((e as Error).message); } finally { setBusy(''); }
  }

  function place(x: number, y: number) {
    if (selected === null || !sim || sim.phase === 'ended' || replay) return;
    const card = sim.players[perspective].deck[selected];
    const point = card.archetype === Archetype.Spell ? { x, y } : dropDecision(perspective, x, y);
    if (!point) return;
    const xFp = Math.round(point.x * FP), yFp = Math.round(point.y * FP);
    if (practice) practiceRef.current?.inputs.push({ tick: practiceRef.current.sim.tick + 2, player: 0, deckIndex: selected, x: xFp, y: yFp });
    else {
      if (!runner) { setError('The match is still loading'); return; }
      try { runner.queuePlay(selected, xFp, yFp); } catch (e) { console.warn('queue failed', e); setError((e as Error).message); return; }
    }
    void new Audio('/sfx/sfx_deploy.mp3').play().catch(() => {});
    setSelected(null);
  }

  if (!practice && !matchId) return <div className="section"><StateBox art title="No match" action={<Link className="key key--sm" to="/app#play">Pick a fight</Link>}>Open a staked match from the Arena or play a free practice match.</StateBox></div>;

  const meSim = sim?.players[perspective];
  const hand = meSim?.cycle.slice(0, 4) ?? [];
  const next = meSim?.cycle[4];
  const elixir = meSim ? meSim.elixirFP / FP : 0;
  const cap = sim ? sim.format.elixirCapFP / FP : 10;
  const regulation = sim?.format.regulationTicks ?? 0;
  const overtime = sim ? sim.tick >= regulation : false;
  const remainingTicks = sim ? (overtime ? regulation + sim.format.overtimeTicks - sim.tick : regulation - sim.tick) : 0;
  const clock = Math.max(0, Math.ceil(remainingTicks / 20));
  const myCrowns = sim ? crownsTaken(sim, perspective) : 0;
  const theirCrowns = sim ? crownsTaken(sim, (1 - perspective) as 0 | 1) : 0;
  const opponent = match ? (match.house !== null ? 'House bot' : seat === 0 ? match.p1 : match.p0) : null;
  const ended = sim?.phase === 'ended';
  const canPlay = !practice && !!runner && !!me && !!match && (match.p0 === me || match.p1 === me) && match.house !== undefined;
  const selectedCard = selected !== null && sim ? sim.players[perspective].deck[selected] : null;
  const showCeremony = (!replay || replay.done) && ((practice && ended) || settled || match?.state === 4 || (!practice && ended && !settled));
  const started = match ? Date.now() >= Number(match.start_ms) : false;

  const steps = [
    { t: 'Stakes escrowed', s: match ? `${formatNear(BigInt(match.stake) * 2n)} NEAR pot · ${TIER_NAMES[match.tier]} · ${FORMAT_NAMES[match.format]}` : '', done: !!match && match.state >= 2 },
    { t: 'Market read at kick-off', s: 'Signed relayer prices, stored per card', done: !!match && match.state >= 2 },
    { t: 'Playing', s: 'Each drop is a play transaction from a session key', done: ended || settled, now: !ended && !settled && started },
    { t: 'Referee replays the log', s: claim ? `This browser computed ${claim.winner === 2 ? 'a draw' : `seat ${claim.winner}`} at tick ${claim.end_tick}` : 'Opens 6 s after the last tick', done: settled, now: ended && !settled },
    { t: 'Paid out', s: settled && match ? `${match.winner === 2 ? 'Draw' : `Seat ${match.winner} won`} · ${match.referee_calls} referee call${match.referee_calls === 1 ? '' : 's'}` : 'In the settle transaction', done: settled },
  ];

  return (
    <div className="battle">
      <div className="arena-stack">
        <div className="mstrip" aria-label={practice ? 'Practice: today\'s signed prices per fighter' : 'Market read stored at kick-off'}>
          <button className={`chip ${stripSide === 'you' ? 'chip--gold' : 'chip--crimson'}`} style={{ minHeight: 40, flex: 'none' }}
            onClick={() => setStripSide((v) => (v === 'you' ? 'foe' : 'you'))} aria-label={`Showing ${stripSide === 'you' ? 'your' : 'the opponent\'s'} market read. Switch.`}>
            {stripSide === 'you' ? 'You' : 'Foe'}
          </button>
          {(() => {
            const side = stripSide === 'you' ? (match ? seat : 0) : (match ? 1 - seat : 1);
            const ids = match ? (side === 0 ? match.deck0 : match.deck1) : sim ? sim.players[side].deck.map((c) => c.fighterId) : [];
            return ids.map((fid, i) => {
              const slot = side * 8 + i;
              const bps = match ? Number(match.mods[slot]) : sim ? sim.players[side].deck[i].metaBps ?? 0 : 0;
              const st = match ? match.status[slot] : fighter(Number(fid)).kind === 'house' ? 1 : 0;
              const lab = statusLabel(st);
              return (
                <div key={slot} className="mslot" title={`${fighter(Number(fid)).ticker} · ${lab.long}`}>
                  <Avatar id={Number(fid)} size={26} ring={stripSide === 'you' ? 'gold' : 'crimson'} />
                  {lab.live ? <MoveChip statBps={bps} small /> : <span className="move move--flat move--sm">{st === 1 ? '—' : lab.short}</span>}
                </div>
              );
            });
          })()}
        </div>
        <div className="bhud bhud--row">
          <span className="plate plate--foe">
            <Avatar id={sim?.players[1 - perspective]?.deck[0]?.fighterId ?? 0} size={30} ring="crimson" />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{practice ? 'Practice bot' : opponent ? <span className="mono">{shortAcct(opponent)}</span> : 'Loading…'}</span>
          </span>
          <span className={`clock${overtime ? ' clock--ot' : ''}`} aria-live="polite">
            <b>{sim ? `${Math.floor(clock / 60)}:${String(clock % 60).padStart(2, '0')}` : '–:––'}</b>
            <span className="crowns" aria-label={`You ${myCrowns}, opponent ${theirCrowns} crowns`}><span className="me">{myCrowns}</span><Icon name="crown" size={15} /><span className="them">{theirCrowns}</span></span>
          </span>
        </div>
        <div style={{ position: 'relative' }}>
          <BattleBoard perspective={perspective} placing={selected !== null && !replay} spell={selectedCard?.archetype === Archetype.Spell}
            onPlace={place} label={selectedCard ? `Tap where ${selectedCard.name} should land` : 'Battle arena'} />
          {!practice && match?.state === 2 && !started && <div className="bhud" style={{ top: '45%' }}><span className="plate" style={{ margin: '0 auto' }}>Kick-off in {Math.max(0, Math.ceil((Number(match.start_ms) - Date.now()) / 1000))} s</span></div>}
          {replay && !replay.done && (
            <div className="bhud" style={{ top: 'auto', bottom: 8 }}>
              <span className="plate" style={{ pointerEvents: 'auto', maxWidth: 'none' }}>
                <span className="chip chip--gold">Replay</span>
                <button className="key key--ghost key--sm" style={{ minHeight: 40 }} onClick={() => setReplay((r) => (r ? { ...r, playing: !r.playing && !r.done } : r))} aria-label={replay.playing ? 'Pause replay' : 'Play replay'}><Icon name={replay.playing ? 'pause' : 'play'} size={16} /></button>
                <span className="seg seg--sm" role="group" aria-label="Replay speed">
                  {[1, 2, 4].map((v) => <button key={v} aria-pressed={replay.speed === v} onClick={() => setReplay((r) => (r ? { ...r, speed: v } : r))}>{v}x</button>)}
                </span>
              </span>
            </div>
          )}
        </div>

        {sim && (
          <div className="hand-bar" data-can-play={canPlay ? 1 : 0} data-runner={runner ? 1 : 0} data-ended={ended ? 1 : 0}>
            <div className="elixir" role="meter" aria-label="Elixir" aria-valuemin={0} aria-valuemax={cap} aria-valuenow={Math.floor(elixir)}>
              <div className="elixir-fill" style={{ width: `${(elixir / cap) * 100}%` }} />
              <div className="elixir-ticks">{Array.from({ length: 10 }, (_, i) => <span key={i} />)}</div>
              <span className="elixir-num">{Math.floor(elixir)}</span>
            </div>
            <div className="hand">
              {hand.map((slot) => {
                const c = sim.players[perspective].deck[slot];
                const afford = elixir >= costOf(c.fighterId);
                return (
                  <FighterCard key={slot} id={c.fighterId} size="sm" picked={selected === slot} className={afford ? '' : 'unaffordable'}
                    statBps={c.metaBps ?? 0} pulse={fighter(c.fighterId).kind === 'house' ? 'house' : null}
                    disabled={ended || !!replay || (!practice && !canPlay)} onClick={() => setSelected(selected === slot ? null : slot)}
                    label={`${c.name}, ${costOf(c.fighterId)} elixir, market ${pct(c.metaBps ?? 0)}${afford ? '' : ', not enough elixir yet'}`} />
                );
              })}
              {next !== undefined && <div className="next"><span className="label" style={{ fontSize: 10 }}>Next</span><FighterCard id={sim.players[perspective].deck[next].fighterId} size="xs" showName={false} /></div>}
            </div>
            <p className="hint" aria-live="polite">
              {replay ? `Replaying ${replay.data.inputs.length} on-chain plays through the same sim.` : ended ? 'Battle over.'
                : !practice && !canPlay ? 'Watching: plays come from the chain.'
                  : selectedCard ? `Tap ${selectedCard.archetype === Archetype.Spell ? 'anywhere' : 'your half'} to drop ${selectedCard.name}.` : 'Pick a card, then tap your half of the arena.'}
            </p>
          </div>
        )}

        {!sim && !showCeremony && (
          <div className="ceremony" style={{ background: 'rgba(3,12,13,.55)' }}>
            <div className="cer-card">
              {match && match.state !== 2 && match.state !== 1 ? (
                <>
                  <p className="fine">This match is {STATE_NAMES[match.state]?.toLowerCase()}. Its result is on chain.</p>
                  <button className="key key--ghost" disabled={!!busy} onClick={() => void startReplay()}>{busy ? <span className="spinner" /> : <Icon name="replay" />}{busy || 'Replay from chain'}</button>
                </>
              ) : match?.state === 1 ? <p className="fine">Match #{match.id} is waiting for an opponent.</p>
                : error ? <StateBox kind="error" title="Could not load the match">{shortError(error, 200)}</StateBox>
                  : <p className="fine" role="status"><span className="spinner" /> {practice ? 'Reading today\'s prices…' : 'Loading the match from chain…'}</p>}
            </div>
          </div>
        )}
        {showCeremony && <Ceremony practice={practice} sim={sim} seat={seat} match={match} me={me} claim={claim} busy={busy} onReplay={() => void startReplay()} replay={replay?.data ?? null} />}
      </div>

      <div className="section stack" style={{ gap: 14, paddingBottom: 24 }}>
        {error && !settled && <StateBox kind="error" title="Heads up">{shortError(error, 240)}</StateBox>}
        {practice ? (
          <section className="panel stack">
            <h2 className="display h3 ivory">Practice</h2>
            <p className="fine">A local Rush match against the scripted bot, with today&apos;s signed prices on every market fighter. Nothing is staked and nothing touches the chain.</p>
            <div className="row" style={{ flexWrap: 'nowrap' }}>
              <button className="key key--ghost key--sm" style={{ flex: 1 }} onClick={() => window.location.reload()}>Restart</button>
              <Link className="key key--sm" style={{ flex: 1 }} to="/app#play">Stake NEAR</Link>
            </div>
          </section>
        ) : (
          <>
            <section className="panel stack" aria-labelledby="m-title">
              <div className="panel-head">
                <h2 id="m-title" className="display h3 ivory">Match #{matchId}</h2>
                {match && <span className={`chip ${match.state === 2 ? 'chip--live' : match.state === 3 ? 'chip--gold' : ''}`}>{STATE_NAMES[match.state] ?? match.state}</span>}
              </div>
              {match && <p className="fine">{shortAcct(match.p0)} vs {match.house !== null ? `house ${shortAcct(match.p1)}` : match.p1 ? shortAcct(match.p1) : '—'} · seed <span className="mono">{match.seed}</span></p>}
              <ol className="rail">
                {steps.map((s) => (
                  <li key={s.t} data-state={s.done ? 'done' : s.now ? 'now' : 'todo'}>
                    <span className="dot" aria-hidden>{s.done ? <Icon name="check" size={13} /> : ''}</span>
                    <div><div className="rail-title">{s.t}</div><div className="rail-sub">{s.s}</div></div>
                  </li>
                ))}
              </ol>
            </section>
            <section className="panel stack" aria-labelledby="tx-title">
              <h2 id="tx-title" className="display h3 ivory">On chain, live</h2>
              {txs.length === 0 ? <p className="fine">{settled ? 'Every drop of this match is stored by the arena; Replay from chain rebuilds it.' : 'No plays yet. Drops are signed by this match\'s session key, so there are no pop-ups.'}</p> : (
                <ul className="list">
                  {[...txs].reverse().map((t) => (
                    <li key={t.key} className="list-row">
                      <span className={`chip ${t.state === 'in' ? 'chip--crimson' : t.state === 'ok' ? 'chip--jade' : t.state === 'no' ? 'chip--crimson' : ''}`}>{t.state === 'in' ? 'In' : t.state === 'ok' ? 'Done' : t.state === 'no' ? 'Refused' : 'Sent'}</span>
                      <span className="t" style={{ fontWeight: 600, fontSize: 14 }}>{t.label}{t.ms != null && t.state === 'ok' ? ` · ${t.ms} ms` : ''}</span>
                      {t.hash ? <TxLink hash={t.hash}>{t.hash.slice(0, 6)}…</TxLink> : <span />}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}

function Ceremony({ practice, sim, seat, match, me, claim, busy, onReplay, replay }: {
  practice: boolean; sim: SimState | null; seat: 0 | 1; match: MatchView | null; me: string | null; claim: Claim | null; busy: string; onReplay: () => void; replay: Replay | null;
}) {
  if (practice && sim) {
    const result = sim.winner === -2 ? 'Draw' : sim.winner === 0 ? 'Victory' : 'Defeat';
    return (
      <div className={`ceremony${result === 'Defeat' ? ' ceremony--defeat' : ''}`}>
        <div className="cer-card">
          <img className="cer-crest" src={result === 'Defeat' ? '/brand/v2/fx-defeat.webp' : '/brand/v2/fx-victory.webp'} alt="" aria-hidden />
          <h2 className={`cer-title ${result === 'Defeat' ? '' : 'gold-text'}`}>{result}</h2>
          <p className="fine">Practice match: nothing staked, nothing on chain.</p>
          <div className="row" style={{ flexWrap: 'nowrap', width: '100%' }}>
            <button className="key key--sm" style={{ flex: 1 }} onClick={() => window.location.reload()}>Play again</button>
            <Link className="key key--ghost key--sm" style={{ flex: 1 }} to="/app#play">Stake NEAR</Link>
          </div>
        </div>
      </div>
    );
  }
  if (match?.state === 3) {
    const mine = !!me && (match.p0 === me || match.p1 === me);
    const result = match.winner === 2 ? 'Draw' : !mine ? (match.house !== null ? (match.winner === 1 ? 'House wins' : 'Player wins') : `Seat ${match.winner} wins`) : match.winner === seat ? 'Victory' : 'Defeat';
    const pot = BigInt(match.stake) * 2n;
    return (
      <div className={`ceremony${result === 'Defeat' ? ' ceremony--defeat' : ''}`}>
        <div className="cer-card">
          <img className="cer-crest" src={result === 'Defeat' ? '/brand/v2/fx-defeat.webp' : '/brand/v2/fx-victory.webp'} alt="" aria-hidden />
          <h2 className={`cer-title ${result === 'Defeat' ? '' : 'gold-text'}`}>{result}</h2>
          <div className="cer-pot">
            <div className="cer-row" style={{ opacity: 1, animation: 'none' }}><span className="label">The pot · {TIER_NAMES[match.tier]}</span><Big value={formatNear(pot)} unit="NEAR" tone="ivory" /></div>
            <div className="cer-split" aria-hidden><i /><i /><i /></div>
            <div className="cer-row"><span className="label">{match.winner === 2 ? 'Paid to each side' : 'Paid to the winner · 92%'}</span><Big value={formatNear(match.winner === 2 ? BigInt(match.paid) / 2n : BigInt(match.paid))} unit="NEAR" tone="gold" /></div>
            <div className="cer-row"><span className="label">Protocol treasury · 5%</span><Big value={formatNear(match.to_treasury)} unit="NEAR" tone="ember" /></div>
            <div className="cer-row"><span className="label">Season {match.season} pool · 3%</span><Big value={formatNear(match.to_season)} unit="NEAR" tone="sapphire" /></div>
          </div>
          {replay ? (
            <div className={`verify${replay.matchesChain ? '' : ' verify--bad'}`} role="status">
              <Icon name="shield" size={22} />
              <div className="stack" style={{ gap: 2 }}>
                <b>{replay.matchesChain ? 'Verified: this browser\'s replay matches the referee' : 'Mismatch: this replay disagrees with the referee'}</b>
                <span className="fine">{replay.inputs.length} on-chain plays replayed to tick {replay.result.end_tick}. State hash <span className="mono">{replay.result.final_hash}</span> · referee <span className="mono">{match.final_hash}</span>.</span>
              </div>
            </div>
          ) : <p className="fine">The arena replayed {match.plays0 + match.plays1} plays to tick {match.end_tick} and stored hash <span className="mono">{match.final_hash}</span>.</p>}
          <div className="row" style={{ flexWrap: 'nowrap', width: '100%' }}>
            <button className="key key--ghost key--sm" style={{ flex: 1 }} disabled={!!busy} onClick={onReplay}>{busy ? <span className="spinner" /> : <Icon name="replay" size={18} />}{replay ? 'Watch again' : 'Replay & verify'}</button>
            <Link className="key key--sm" style={{ flex: 1 }} to="/app#play">Fight again</Link>
          </div>
          <p className="fine"><AddrLink address={match.p0} /> vs <AddrLink address={match.p1 ?? ''} /></p>
        </div>
      </div>
    );
  }
  if (match?.state === 4) {
    return (
      <div className="ceremony ceremony--defeat">
        <div className="cer-card">
          <h2 className="cer-title">Refunded</h2>
          <p className="fine">This match was cancelled before anyone joined, and its stake went back to its creator.</p>
          <Link className="key key--sm" to="/app#play">Arena</Link>
        </div>
      </div>
    );
  }
  return (
    <div className="ceremony">
      <div className="cer-card">
        <h2 className="cer-title ivory" style={{ fontSize: 40 }}>Referee is up</h2>
        <div className="panel stack" style={{ textAlign: 'left' }}>
          <p className="fine">The battle is over on screen. Once the play log closes, the arena replays every stored play through the same sim and pays whoever its replay says won. {claim ? `This browser computed ${claim.winner === 2 ? 'a draw' : `seat ${claim.winner}`} (hash ${claim.final_hash}).` : ''}</p>
          <p className="fine" role="status">{busy ? <><span className="spinner" /> {busy}…</> : 'Anyone can trigger it; the relayer\'s keeper does if nobody else does.'}</p>
        </div>
      </div>
    </div>
  );
}
