// SPDX-License-Identifier: MIT
import { pendingEnergy } from '../battle/placement';
import { useCardDrag } from '../battle/useCardDrag';
import { PlaySessionSigner } from '../lib/signing';
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
import { chainChanged, reader, useHouses } from '../state/data';
import { loadDeck } from '../state/deck';
import { saveBrowserTxs } from '../lib/receipts';
import { crownsTaken, towerHealth } from '../lib/match';
import { HOUSE_DIFFICULTY } from '@mempire/sim';
import { removeSession, settle } from '../lib/play';
import { costOf, fighter, pct, shortAcct, statusLabel, shortError } from '../lib/fighters';
import { BattleBoard, dropDecision } from '../battle/BattleBoard';
import { AddrLink, Art, Avatar, Big, BotAvatar, Crowns, FighterCard, Icon, MoveChip, StateBox, TxLink } from '../ui/kit';
import { ART, OBJ3D, houseArt } from '../lib/art';
import { ArenaPulse, ChainFeed, DeckCycle, FoeCard, PotCard, Scoreboard, type TxRow } from '../battle/Rails';

type Replay = Awaited<ReturnType<typeof replayFromChain>>;

const PRACTICE_BOT = [0, 9, 2, 10, 4, 7, 3, 1];
const TIPS_SEEN = 'mempire:near:tips';
function cards(ids: readonly number[], stat: (id: number) => number): MatchCard[] {
  return ids.map((id) => {
    const f = roster.fighters[id];
    return { fighterId: id, name: f.ticker, archetype: f.archetype as MatchCard['archetype'], trait: traitFor(f.ticker), level: 1, metaBps: stat(id) };
  });
}

export function Battle({ practice = false }: { practice?: boolean }) {
  const { id, rival = 'bot' } = useParams();
  const matchId = practice ? null : id ?? null;
  const houses = useHouses();
  const house = practice && rival !== 'bot' ? houses.data?.find((h) => h.name.toLowerCase() === rival) ?? null : null;
  const rivalReady = !practice || rival === 'bot' || !!house || !!houses.error;
  const rivalName = house ? house.name : 'Training bot';
  const rivalIsBot = practice && !house;
  const [intro, setIntro] = useState<'tips' | 'count' | null>(() => (practice ? (localStorage.getItem(TIPS_SEEN) ? 'count' : 'tips') : null));
  const [count, setCount] = useState(3);
  const startedRef = useRef(!practice);
  const [toast, setToast] = useState<{ text: string; key: number; foe: boolean } | null>(null);
  const [shake, setShake] = useState(0);
  const crownsSeen = useRef<[number, number]>([0, 0]);
  const [, bump] = useState(0);
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
  const [pendingCards, setPendingCards] = useState<Map<number,number>>(new Map());
  const pendingHashes = useRef(new Map<string,number>());
  const [sound, setSound] = useState(false);
  const [details, setDetails] = useState(false);
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
  useEffect(() => { if (matchId && txs.length) saveBrowserTxs(matchId, txs); }, [matchId, txs]);

  // Practice: a local sim against the scripted bot with today's signed prices. Nothing touches the chain.
  const marketReady = !market.loading || !!market.error;
  useEffect(() => {
    if (!practice || !marketReady || !rivalReady || practiceRef.current) return;
    const { byId } = useMarketStore.getState();
    const stat = (fid: number) => byId.get(fid)?.statBps ?? 0;
    const state = createMatch(Math.floor(Math.random() * 2 ** 32), [cards(loadDeck(me), stat), cards(house ? house.deck : PRACTICE_BOT, stat)], FORMATS.rush);
    practiceRef.current = { sim: state, inputs: [] };
    setSim(state, 0);
  }, [practice, marketReady, rivalReady, house, me, setSim]);
  // The kick-off countdown: 3, 2, 1, then the local sim starts.
  useEffect(() => {
    if (intro !== 'count') return;
    if (count <= 0) { startedRef.current = true; setIntro(null); return; }
    const t = setTimeout(() => setCount((c) => c - 1), 700);
    return () => clearTimeout(t);
  }, [intro, count]);
  useEffect(() => {
    if (!practice) return;
    const t = setInterval(() => {
      const v = practiceRef.current;
      if (!v || v.sim.phase === 'ended' || !startedRef.current) return;
      const input = decideBot(v.sim, 1, botLevel.current);
      if (input) v.inputs.push(input);
      stepSim(v.sim, v.inputs.filter((e) => e.tick === v.sim.tick));
      setSim(structuredClone(v.sim), 0);
    }, 50);
    return () => clearInterval(t);
  }, [practice, setSim]);
  useEffect(() => () => { practiceRef.current = null; }, []);
  // A crown toast when a tower falls on either side, from the sim's own tower hit points.
  useEffect(() => {
    if (!sim) { crownsSeen.current = [0, 0]; return; }
    const mine = crownsTaken(sim, perspective), theirs = crownsTaken(sim, (1 - perspective) as 0 | 1);
    const [a, b] = crownsSeen.current;
    if (mine > a) setToast({ text: mine === 3 ? 'King keep down!' : 'Tower down! +1 crown', key: Date.now(), foe: false });
    else if (theirs > b) setToast({ text: theirs === 3 ? 'Your king keep fell' : 'You lost a tower', key: Date.now(), foe: true });
    if (mine > a || theirs > b) setShake(Date.now());
    crownsSeen.current = [mine, theirs];
  }, [sim, perspective]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 2200); return () => clearTimeout(t); }, [toast]);
  useEffect(() => { if (!shake) return; const t = setTimeout(() => setShake(0), 600); return () => clearTimeout(t); }, [shake]);
  // Re-render twice a second so the kick-off countdown moves before the first sim state arrives.
  useEffect(() => { const t = setInterval(() => bump((x) => x + 1), 500); return () => clearInterval(t); }, []);
  const botLevel = useRef<'easy' | 'normal' | 'hard'>('normal');
  botLevel.current = house ? HOUSE_DIFFICULTY[house.difficulty] ?? 'normal' : 'normal';

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
        const session = key ? new PlaySessionSigner(net.rpc, me!, KeyPair.fromString(key as never)) : null;
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
            else if (e.type === 'playSent') { pendingHashes.current.set(e.hash,e.deckIndex); const fid = Number((seat === 0 ? m.deck0 : m.deck1)[e.deckIndex]); addTx({ key: e.hash, label: `${fighter(fid).ticker} dropped · tick ${e.tick}`, hash: e.hash, state: 'sent', fighterId: fid, at: Date.now() }); }
            else if (e.type === 'playLanded') setTxs((old) => old.map((t) => (t.key === e.hash ? { ...t, state: 'ok', ms: e.ms } : t)));
            else if (e.type === 'playRefused') { const slot=pendingHashes.current.get(e.hash ?? ''); if(slot!==undefined)setPendingCards(old=>{const next=new Map(old);next.delete(slot);return next;}); console.warn('play refused', e.error); setTxs((old) => (old.some((t) => t.key === e.hash && e.hash) ? old.map((t) => (t.key === e.hash ? { ...t, state: 'no', label: `${t.label}: refused (${shortError(e.error, 60)})` } : t)) : [...old, { key: `r${Date.now()}`, label: `A drop was not sent: ${shortError(e.error, 80)}`, state: 'no' }])); }
            else if (e.type === 'opponentPlay') { const fid = Number((e.input.player === 0 ? m.deck0 : m.deck1)[e.input.deckIndex]); addTx({ key: `o${e.input.tick}-${e.input.deckIndex}`, label: `Rival ${fighter(fid).ticker} · tick ${e.input.tick}`, state: 'in', fighterId: fid }); }
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
    void removeSession(signer, matchId, (s) => addTx({ key: s.hash ?? s.label, label: s.label, hash: s.hash, state: 'ok' })).catch(e => setError(`Play key removal failed: ${(e as Error).message}. Reload this match to retry.`));
  }, [settled, matchId, signer]);
  useEffect(() => {
    if (!settled || resultSound.current || replay || !match || match.winner === 2) return;
    const mine = me && (match.p0 === me || match.p1 === me);
    if (!mine) return;
    resultSound.current = true;
    if (sound) void new Audio(match.winner === seat ? '/sfx/sfx_victory.mp3' : '/sfx/sfx_defeat.mp3').play().catch(() => {});
  }, [settled, match, seat, me, replay, sound]);

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

  useEffect(()=>{if(!sim)return;const hand=sim.players[perspective].cycle.slice(0,4);setPendingCards(old=>{if(!old.size||[...old.keys()].every(slot=>hand.includes(slot)))return old;return new Map([...old].filter(([slot])=>hand.includes(slot)));});},[sim,perspective]);

  function place(x: number, y: number, slot = selected) {
    if (slot === null || !sim || sim.phase === 'ended' || replay) return;
    const card = sim.players[perspective].deck[slot];
    const hand=sim.players[perspective].cycle.slice(0,4);
    if (pendingCards.has(slot) || !hand.includes(slot) || sim.players[perspective].elixirFP/FP - pendingEnergy(hand,pendingCards) < costOf(card.fighterId)) return;
    const point = card.archetype === Archetype.Spell ? { x, y } : dropDecision(perspective, x, y);
    if (!point) return;
    const xFp = Math.round(point.x * FP), yFp = Math.round(point.y * FP);
    if (practice) practiceRef.current?.inputs.push({ tick: practiceRef.current.sim.tick + 2, player: 0, deckIndex: slot, x: xFp, y: yFp });
    else {
      if (!runner) { setError('The match is still loading'); return; }
      try { runner.queuePlay(slot, xFp, yFp); } catch (e) { console.warn('queue failed', e); setError((e as Error).message); return; }
    }
    setPendingCards(old=>new Map(old).set(slot,costOf(card.fighterId)));
    if (sound) void new Audio('/sfx/sfx_deploy.mp3').play().catch(() => {});
    setSelected(null);
  }

  const drag = useCardDrag(perspective, !!sim && sim.phase !== 'ended' && !replay && (practice ? startedRef.current : !!runner), setSelected, place);

  if (!practice && !matchId) return <div className="screen"><StateBox art title="No match" action={<Link className="btn btn--gold btn--sm" to="/app#play">Pick a fight</Link>}>Open a staked match from the Arena or play a free practice match.</StateBox></div>;

  const meSim = sim?.players[perspective];
  const hand = meSim?.cycle.slice(0, 4) ?? [];
  const next = meSim?.cycle[4];
  const elixir = meSim ? Math.max(0,meSim.elixirFP / FP - pendingEnergy(hand,pendingCards)) : 0;
  const cap = sim ? sim.format.elixirCapFP / FP : 10;
  const regulation = sim?.format.regulationTicks ?? 0;
  const overtime = sim ? sim.phase === 'overtime' || (sim.format.overtimeTicks > 0 && sim.tick >= regulation && sim.phase !== 'ended') : false;
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

  const foeSeat = (1 - perspective) as 0 | 1;
  const marketRead = (side: 0 | 1) => {
    const ids = match ? (side === 0 ? match.deck0 : match.deck1) : sim ? sim.players[side].deck.map((c) => c.fighterId) : [];
    return ids.map((fid, i) => {
      const slot = side * 8 + i;
      const bps = match ? Number(match.mods[slot]) : sim ? sim.players[side].deck[i].metaBps ?? 0 : 0;
      const st = match ? match.status[slot] : fighter(Number(fid)).kind === 'house' ? 1 : 0;
      const lab = statusLabel(st);
      return (
        <div key={slot} className="mslot" title={`${fighter(Number(fid)).ticker} · ${lab.long}`}>
          <Avatar id={Number(fid)} size={34} ring={stripSide === 'you' ? 'gold' : 'crimson'} />
          {lab.live ? <MoveChip statBps={bps} small /> : <span className="move move--flat move--sm">{st === 1 ? '—' : lab.short}</span>}
        </div>
      );
    });
  };

  const lastTx = [...txs].reverse().find((t) => t.state !== 'in') ?? null;
  const foeName = practice ? rivalName : opponent ? (match?.house !== null && match ? `${shortAcct(opponent).split('.')[0].replace(/^./, (c) => c.toUpperCase())}` : shortAcct(opponent)) : 'Loading…';
  const foeHouseName = practice ? (house?.name ?? null) : match && match.house !== null && match.p1 ? match.p1.split('.')[0] : null;
  const foeArt = foeHouseName ? houseArt(foeHouseName) : null;
  const foeSub = practice ? (house ? `House · ${HOUSE_DIFFICULTY[house.difficulty] ?? 'normal'} bot · its on-chain deck` : 'Training bot · local') : match ? (match.house !== null ? `House · ${HOUSE_DIFFICULTY[houses.data?.find((h) => h.account === match.p1)?.difficulty ?? 0] ?? 'easy'} bot · refereed on chain` : 'Player · staked the same pot') : '';
  const dragCard = drag.dragging && drag.client && selectedCard ? selectedCard : null;

  const rails = (
    <>
      <div className="rail rail--left">
        <Link className="rail-back" to={practice ? '/app/practice' : '/app'}><Icon name="chevL" size={18} />{practice ? 'Practice rivals' : 'Lobby'}</Link>
        <FoeCard name={foeName} sub={foeSub} art={foeArt} bot={rivalIsBot} fighterId={sim?.players[foeSeat]?.deck[0]?.fighterId} />
        <Scoreboard sim={sim} seat={perspective} you="You" foe={foeName} />
        <PotCard match={match} practice={practice} />
        <DeckCycle sim={sim} seat={perspective} />
        {practice && (
          <div className="rail-actions">
            <button className="btn btn--white btn--sm" onClick={() => window.location.reload()}><Icon name="replay" size={16} />Restart</button>
            <Link className="btn btn--gold btn--sm" to="/app/houses">Stake NEAR</Link>
          </div>
        )}
      </div>
      <div className="rail rail--right">
        {error && !settled && <StateBox kind="error" title="Heads up">{shortError(error, 240)}</StateBox>}
        {practice ? <ArenaPulse /> : <ChainFeed txs={txs} settled={settled} />}
        {!practice && match && (
          <section className="rail-card" aria-labelledby="m-title">
            <div className="rail-head"><h2 id="m-title" className="rail-title">Match #{matchId}</h2>{match && <span className={`chip ${match.state === 2 ? 'chip--live' : match.state === 3 ? 'chip--gold' : ''}`}>{STATE_NAMES[match.state] ?? match.state}</span>}</div>
            <ol className="rail-steps">
              {steps.map((s) => (
                <li key={s.t} data-state={s.done ? 'done' : s.now ? 'now' : 'todo'}>
                  <span className="dot" aria-hidden>{s.done ? <Icon name="check" size={12} /> : ''}</span>
                  <span className="rail-steps-t">{s.t}</span>
                </li>
              ))}
            </ol>
          </section>
        )}
        <section className="rail-card" aria-label={practice ? 'Today\'s signed prices per fighter' : 'Market read stored at kick-off'}>
          <div className="rail-head">
            <h2 className="rail-title">{practice ? 'Today\'s market' : 'Market at kick-off'}</h2>
            <button className={`chip chip--btn ${stripSide === 'you' ? 'chip--gold' : 'chip--crimson'}`}
              onClick={() => setStripSide((v) => (v === 'you' ? 'foe' : 'you'))} aria-label={`Showing ${stripSide === 'you' ? 'your' : 'the rival\'s'} market read. Switch.`}>
              {stripSide === 'you' ? 'You' : 'Rival'} <Icon name="replay" size={12} />
            </button>
          </div>
          <div className="mstrip">{marketRead(stripSide === 'you' ? (match ? seat : 0) : (match ? (1 - seat) as 0 | 1 : 1))}</div>
        </section>
      </div>
    </>
  );

  return (
    <div className={`battle${details ? ' battle--details' : ''}`} data-practice={practice ? 1 : 0}>
      <div className="arena-stack">
        <div className="bhud bhud--row">
          <Link className="battle-back btn btn--white btn--icon" to={practice ? '/app/practice' : '/app'} aria-label="Leave battle"><Icon name="chevL" size={20}/></Link>
          <span className="plate plate--foe">
            {foeArt ? <span className="avatar avatar--crimson plate-art" style={{ width: 36, height: 36 }}><Art src={foeArt} eager fallback={<Icon name="castle" size={16} />} /></span> : rivalIsBot ? <BotAvatar size={36} ring="crimson" /> : <Avatar id={sim?.players[foeSeat]?.deck[0]?.fighterId ?? 0} size={36} ring="crimson" />}
            <span className="plate-name">{foeName}</span>
          </span>
          <span className={`clock${overtime ? ' clock--ot' : ''}${sim && !ended && clock <= 10 ? ' clock--low' : ''}`} aria-live="polite">
            <b>{sim ? `${Math.floor(clock / 60)}:${String(clock % 60).padStart(2, '0')}` : '–:––'}</b>
            <span className="crowns" aria-label={`You ${myCrowns}, rival ${theirCrowns} crowns`}><span className="me">{myCrowns}</span><Icon name="crown" size={16} /><span className="them">{theirCrowns}</span></span>
          </span>
          {overtime && <span className="ot-badge">Overtime</span>}
        </div>
        <div className={`board-box${shake ? ' is-shaking' : ''}`}>
          <BattleBoard perspective={perspective} placing={selected !== null && !replay} spell={selectedCard?.archetype === Archetype.Spell}
            onPlace={place} preview={drag.preview} fighterId={selectedCard?.fighterId} label={selectedCard ? `Tap where ${selectedCard.name} should land` : 'Battle arena'} />
          {sim && !ended && !replay && selected === null && hand.length > 0 && !intro && (sim.tick < 60 || (practice && (practiceRef.current?.inputs.filter((i) => i.player === 0).length ?? 0) === 0)) && (
            <div className="board-hint" aria-hidden><Icon name="arrow" size={18} />Drag a card onto your side</div>
          )}
          {practice && intro && sim && (
            <VsIntro you="You" foe={rivalName} foeBot={rivalIsBot} youDeck={sim.players[0].deck.map((c) => c.fighterId)} foeDeck={sim.players[1].deck.map((c) => c.fighterId)}
              note="Practice · local · no stake" count={intro === 'count' ? count : null}
              onStart={() => { try { localStorage.setItem(TIPS_SEEN, '1'); } catch { /* private mode */ } setIntro('count'); }} />
          )}
          {!practice && match?.state === 2 && !started && (
            <VsIntro you={me && (match.p0 === me || match.p1 === me) ? 'You' : shortAcct(match.p0)} foe={match.house !== null ? `House ${shortAcct(match.p1).split('.')[0]}` : shortAcct(seat === 0 ? match.p1 : match.p0)}
              youDeck={seat === 0 ? match.deck0 : match.deck1} foeDeck={seat === 0 ? match.deck1 : match.deck0}
              note={`${TIER_NAMES[match.tier]} · ${formatNear(BigInt(match.stake) * 2n)} NEAR pot · refereed on-chain`} count={Math.max(0, Math.ceil((Number(match.start_ms) - Date.now()) / 1000))} />
          )}
          {toast && <div key={toast.key} className={`crown-toast${toast.foe ? ' crown-toast--foe' : ''}`} role="status"><Art src={OBJ3D.crown} fallback={<Icon name="crown" size={28} />} /><b>{toast.text}</b></div>}
          {!practice && lastTx && lastTx.hash && !ended && (
            <div key={`${lastTx.key}:${lastTx.state}`} className={`tx-toast tx-toast--${lastTx.state}`} role="status">
              {lastTx.state === 'sent' ? <span className="spinner spinner--xs" /> : lastTx.state === 'ok' ? <Icon name="check" size={13} /> : <Icon name="x" size={13} />}
              <span>{lastTx.state === 'sent' ? 'Card sent as a transaction' : lastTx.state === 'ok' ? `On chain in ${((lastTx.ms ?? 0) / 1000).toFixed(1)} s` : 'Refused by the arena'}</span>
              <TxLink hash={lastTx.hash}>{lastTx.hash.slice(0, 6)}… ↗</TxLink>
            </div>
          )}
          {replay && !replay.done && (
            <div className="replay-bar">
              <span className="chip chip--gold">Replay</span>
              <button className="btn btn--white btn--icon" onClick={() => setReplay((r) => (r ? { ...r, playing: !r.playing && !r.done } : r))} aria-label={replay.playing ? 'Pause replay' : 'Play replay'}><Icon name={replay.playing ? 'pause' : 'play'} size={16} /></button>
              <span className="seg seg--sm" role="group" aria-label="Replay speed">
                {[1, 2, 4].map((v) => <button key={v} aria-pressed={replay.speed === v} onClick={() => setReplay((r) => (r ? { ...r, speed: v } : r))}>{v}x</button>)}
              </span>
            </div>
          )}
          {!sim && !showCeremony && (
            <div className="ceremony ceremony--wait">
              <div className="cer-card">
                {match && match.state !== 2 && match.state !== 1 ? (
                  <>
                    <p className="fine">This match is {STATE_NAMES[match.state]?.toLowerCase()}. Its result is on chain.</p>
                    <button className="btn btn--blue" disabled={!!busy} onClick={() => void startReplay()}>{busy ? <span className="spinner" /> : <Icon name="replay" />}{busy || 'Replay from chain'}</button>
                  </>
                ) : match?.state === 1 ? <p className="fine">Match #{match.id} is waiting for an opponent.</p>
                  : error ? <StateBox kind="error" title="Could not load the match">{shortError(error, 200)}</StateBox>
                    : <p className="fine" role="status"><span className="spinner" /> {practice ? 'Reading today\'s prices…' : 'Loading the match from chain…'}</p>}
              </div>
            </div>
          )}
          {showCeremony && <Ceremony practice={practice} rivalName={rivalName} rivalIsBot={rivalIsBot} crowns={sim ? [myCrowns, theirCrowns] : null} sim={sim} seat={seat} match={match} me={me} claim={claim} busy={busy} onReplay={() => void startReplay()} replay={replay?.data ?? null} />}
        </div>

        {sim && (
          <div className="hand-bar" data-can-play={canPlay ? 1 : 0} data-runner={runner ? 1 : 0} data-ended={ended ? 1 : 0}>
            <div className="hand" data-dragging={drag.dragging}>
              {hand.map((slot) => {
                const c = sim.players[perspective].deck[slot];
                const cost = costOf(c.fighterId);
                const afford = elixir >= cost;
                return (
                  <div key={slot} className="hand-slot" data-slot={slot} data-afford={afford ? 1 : 0} style={{ ['--fill' as string]: `${Math.min(1, elixir / cost) * 100}%` }}
                    onPointerDown={e => { if (afford && !pendingCards.has(slot)) drag.start(slot,e); }} onClickCapture={drag.clickCapture}>
                  <FighterCard id={c.fighterId} size="sm" picked={selected === slot} className={afford ? '' : 'unaffordable'}
                    statBps={c.metaBps ?? 0} pulse={fighter(c.fighterId).kind === 'house' ? 'house' : null}
                    disabled={pendingCards.has(slot) || ended || !!replay || (!practice && !canPlay)} onClick={() => setSelected(selected === slot ? null : slot)}
                    label={`${c.name}, ${cost} elixir, market ${pct(c.metaBps ?? 0)}${afford ? '' : ', not enough elixir yet'}`} />
                  {pendingCards.has(slot) && <span className="card-pending" role="status"><span className="spinner spinner--xs" />Sending</span>}
                  </div>
                );
              })}
              {next !== undefined && <div className="next"><span className="label">Next</span><FighterCard id={sim.players[perspective].deck[next].fighterId} size="xs" showName={false} /></div>}
            </div>
            <div className="elixir" role="meter" aria-label="Elixir" aria-valuemin={0} aria-valuemax={cap} aria-valuenow={Math.floor(elixir)}>
              <span className="elixir-drop" aria-hidden><Icon name="drop" size={18} /><b>{Math.floor(elixir)}</b></span>
              <div className="elixir-track">
                <div className="elixir-fill" style={{ width: `${(elixir / cap) * 100}%` }} />
                <div className="elixir-ticks">{Array.from({ length: 10 }, (_, i) => <span key={i} />)}</div>
              </div>
              <button className="battle-sound" onClick={()=>setSound(!sound)} aria-pressed={sound} aria-label={sound ? 'Mute' : 'Sound on'}><Icon name={sound ? 'bolt' : 'x'} size={14} />{sound ? 'Sound' : 'Muted'}</button>
              <button className="battle-details" aria-expanded={details} onClick={()=>setDetails(!details)}>Details</button>
            </div>
            <p className="hint sr-only" aria-live="polite">
              {replay ? `Replaying ${replay.data.inputs.length} on-chain plays through the same sim.` : ended ? 'Battle over.'
                : !practice && !canPlay ? 'Watching: plays come from the chain.'
                  : selectedCard ? `Tap ${selectedCard.archetype === Archetype.Spell ? 'anywhere' : 'your half'} to drop ${selectedCard.name}.` : 'Drag a card onto your half of the arena, or tap a card and then tap the arena.'}
            </p>
          </div>
        )}
      </div>

      <aside className="bside" aria-label="Match details">{rails}</aside>
      {dragCard && drag.client && (
        <div className={`drag-card${drag.preview ? ' is-over' : ''}`} style={{ left: drag.client.x, top: drag.client.y }} aria-hidden>
          <FighterCard id={dragCard.fighterId} size="sm" statBps={dragCard.metaBps ?? 0} />
        </div>
      )}
    </div>
  );
}

function Confetti() {
  return <div className="confetti" aria-hidden>{Array.from({ length: 18 }, (_, i) => <i key={i} style={{ ['--i' as string]: i }} />)}</div>;
}

/** The pre-battle screen: both decks face off, the first-run tips, then a 3-2-1. */
function VsIntro({ you, foe, foeBot, youDeck, foeDeck, note, count, onStart }: {
  you: string; foe: string; foeBot?: boolean; youDeck: readonly number[]; foeDeck: readonly number[]; note: string; count: number | null; onStart?: () => void;
}) {
  return (
    <div className={`vs-intro${count === null ? ' vs-intro--tips' : ''}`} role="dialog" aria-label={`${you} versus ${foe}`} style={{ ['--vs-art' as string]: `url(${ART.vsBurst})` }}>
      <div className="vs-row vs-row--foe">{foeBot && <BotAvatar size={48} ring="crimson" />}<span className="vs-name">{foe}</span><div className="vs-deck">{foeDeck.slice(0, 8).map((id, i) => <Avatar key={i} id={id} size={34} ring="crimson" />)}</div></div>
      <div className="vs-mid">
        <span className="vs-badge">VS</span>
        <span className="vs-note">{note}</span>
        {count !== null ? <span className="vs-count" key={count} aria-live="assertive">{count > 0 ? count : 'Fight!'}</span> : (
          <div className="vs-tips">
            <ol>
              <li><b>1</b>Tap a card in your hand.</li>
              <li><b>2</b>Tap your half of the arena to drop it. Cards cost elixir; it refills.</li>
              <li><b>3</b>Knock down towers. Each one is a crown; most crowns in 30 s wins.</li>
            </ol>
            <button className="btn btn--green btn--lg btn--wide" onClick={onStart} autoFocus>Start battle <Icon name="arrow" size={22} /></button>
          </div>
        )}
      </div>
      <div className="vs-row vs-row--you"><div className="vs-deck">{youDeck.slice(0, 8).map((id, i) => <Avatar key={i} id={id} size={34} ring="gold" />)}</div><span className="vs-name">{you}</span></div>
    </div>
  );
}

function Ceremony({ practice, rivalName, rivalIsBot, crowns, sim, seat, match, me, claim, busy, onReplay, replay }: {
  practice: boolean; rivalName: string; rivalIsBot: boolean; crowns: [number, number] | null; sim: SimState | null; seat: 0 | 1; match: MatchView | null; me: string | null; claim: Claim | null; busy: string; onReplay: () => void; replay: Replay | null;
}) {
  if (practice && sim) {
    const result = sim.winner === -2 ? 'Draw' : sim.winner === 0 ? 'Victory' : 'Defeat';
    return (
      <div className={`ceremony${result === 'Defeat' ? ' ceremony--defeat' : ''}`}>
        {result === 'Victory' && <Confetti />}
        <div className="cer-card">
          <Art className="cer-crest" src={result === 'Draw' ? OBJ3D.chest : result === 'Defeat' ? OBJ3D.down : OBJ3D.crown} fallback={<Icon name="crown" size={64} />} />
          <h2 className="cer-title">{result}</h2>
          {crowns && <div className="cer-crowns"><div><span className="label">You</span><Crowns n={crowns[0]} /></div><div><span className="label cer-rival">{rivalIsBot && <BotAvatar size={28} ring="crimson" />}{rivalName}</span><Crowns n={crowns[1]} side="red" /></div></div>}
          <ul className="cer-stats">
            <li><b className="num">{Math.round(towerHealth(sim, 0) * 100)}%</b><span>your towers left</span></li>
            <li><b className="num">{Math.round(towerHealth(sim, 1) * 100)}%</b><span>{rivalName}&apos;s towers left</span></li>
          </ul>
          <p className="fine">Practice: no stake, no season points, nothing on chain. Stake a match to win NEAR.</p>
          <div className="cta-row">
            <button className="btn btn--gold" onClick={() => window.location.reload()}>Play again</button>
            <Link className="btn btn--white" to="/app/practice">New rival</Link>
            <Link className="btn btn--green" to="/app#play">Stake NEAR</Link>
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
        {result === 'Victory' && <Confetti />}
        <div className="cer-card">
          <Art className="cer-crest" src={result === 'Draw' ? OBJ3D.chest : result === 'Defeat' ? OBJ3D.down : OBJ3D.crown} fallback={<Icon name="crown" size={64} />} />
          <h2 className="cer-title">{result}</h2>
          {crowns && <div className="cer-crowns"><div><span className="label">Seat {seat}</span><Crowns n={crowns[0]} /></div><div><span className="label">Seat {1 - seat}</span><Crowns n={crowns[1]} side="red" /></div></div>}
          <div className="cer-vs">
            <span className={match.winner === 0 ? 'is-win' : ''}><AddrLink address={match.p0} /></span>
            <b>VS</b>
            <span className={match.winner === 1 ? 'is-win' : ''}><AddrLink address={match.p1 ?? ''} /></span>
          </div>
          <div className="cer-pot">
            <div className="cer-row cer-row--pot"><span className="label">The pot · {TIER_NAMES[match.tier]}</span><Big value={formatNear(pot)} unit="NEAR" tone="ivory" /></div>
            <div className="cer-split" aria-hidden><i /><i /><i /></div>
            <div className="cer-row"><span className="label">{match.winner === 2 ? 'Paid to each side' : 'Paid to the winner · 92%'}</span><Big value={formatNear(match.winner === 2 ? BigInt(match.paid) / 2n : BigInt(match.paid))} unit="NEAR" tone="gold" /></div>
            <div className="cer-row"><span className="label">Protocol treasury · 5%</span><Big value={formatNear(match.to_treasury)} unit="NEAR" tone="ember" /></div>
            <div className="cer-row"><span className="label">Season {match.season} pool · 3%</span><Big value={formatNear(match.to_season)} unit="NEAR" tone="sapphire" /></div>
          </div>
          {replay ? (
            <div className={`verify${replay.matchesChain ? '' : ' verify--bad'}`} role="status">
              <span className="verify-ico"><Icon name={replay.matchesChain ? 'shield' : 'x'} size={22} /></span>
              <div className="stack" style={{ gap: 2, minWidth: 0 }}>
                <b>{replay.matchesChain ? 'Verified: this browser\'s replay matches the referee' : 'Mismatch: this replay disagrees with the referee'}</b>
                <span className="fine">{replay.inputs.length} on-chain plays replayed to tick {replay.result.end_tick}. State hash <span className="mono">{replay.result.final_hash}</span> · referee <span className="mono">{match.final_hash}</span>.</span>
              </div>
            </div>
          ) : <p className="fine">The arena replayed {match.plays0 + match.plays1} plays to tick {match.end_tick} and stored hash <span className="mono">{match.final_hash}</span>.</p>}
          <div className="cta-row">
            <button className="btn btn--blue" disabled={!!busy} onClick={onReplay}>{busy ? <span className="spinner" /> : <Icon name="replay" size={18} />}{replay ? 'Watch again' : 'Replay & verify'}</button>
            <Link className="btn btn--white" to={`/app/match/${match.id}`}>Referee receipt</Link>
            <Link className="btn btn--gold" to="/app#play">Battle again</Link>
          </div>
        </div>
      </div>
    );
  }
  if (match?.state === 4) {
    return (
      <div className="ceremony ceremony--defeat">
        <div className="cer-card">
          <Art className="cer-crest" src={OBJ3D.chest} fallback={<Icon name="castle" size={56} />} />
          <h2 className="cer-title">Refunded</h2>
          <p className="fine">This match was cancelled before anyone joined, and its stake went back to its creator.</p>
          <Link className="btn btn--gold" to="/app#play">Back to the lobby</Link>
        </div>
      </div>
    );
  }
  return (
    <div className="ceremony ceremony--wait">
      <div className="cer-card">
        <h2 className="cer-title cer-title--sm">Referee is up</h2>
        <p className="fine">The battle is over on screen. Once the play log closes, the arena replays every stored play through the same sim and pays whoever its replay says won. {claim ? `This browser computed ${claim.winner === 2 ? 'a draw' : `seat ${claim.winner}`} (hash ${claim.final_hash}).` : ''}</p>
        <p className="fine" role="status">{busy ? <><span className="spinner" /> {busy}…</> : 'Anyone can trigger it; the relayer\'s keeper does if nobody else does.'}</p>
      </div>
    </div>
  );
}
