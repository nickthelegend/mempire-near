import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { ArenaClient, MatchRunner, arenaAbi, roster, type RunnerEvent } from '@mempire/sdk';
import { Archetype, cloneState, createMatch, decideBot, FORMATS, FP, stepSim, traitForMint, type InputEvent, type MatchCard, type SimState } from '@mempire/sim';
import { privateKeyToAccount } from 'viem/accounts';
import { type Hex } from 'viem';
import { publicClient, walletFor } from '../chain/wallet';
import { useChainStore } from '../state/chain';
import { useWallet } from '../state/wallet';
import { useMatch } from '../state/battle';
import { formatWif } from '../state/format';
import { useMarket, useMarketStore } from '../state/market';
import { replayMatch, type Replay } from '../state/replay';
import { costOf, fighter, pct, shortAddr, statusLabel, FORMAT_NAMES, TIER_NAMES, shortError } from '../lib/fighters';
import { downloadShareCard } from '../lib/shareCard';
import { BattleBoard, dropDecision } from '../battle/BattleBoard';
import { Avatar, Big, Countdown, FighterCard, Icon, MoveChip, StateBox, TxLink } from '../ui/kit';

type ChainMatch = Awaited<ReturnType<ArenaClient['match']>>;
type Settlement = { paid: bigint; burned: bigint; toSeason: bigint; winner: number; points: bigint; hash: Hex };
type TxRow = { key: string; label: string; hash?: Hex; ms?: number; state: 'sent' | 'ok' | 'in' | 'no' };

const PRACTICE_YOU = [0, 1, 2, 3, 4, 5, 15, 16];
const PRACTICE_BOT = [0, 1, 2, 3, 4, 5, 17, 18];
/** Practice uses today's live market read, the same formula the arena stores at kick-off. */
function cards(ids: readonly number[], stat: (id: number) => number): MatchCard[] {
  return ids.map((id) => {
    const f = roster.fighters[id];
    return { fighterId: id, name: f.ticker, archetype: f.archetype as MatchCard['archetype'], trait: traitForMint(f.ticker), level: 1, metaBps: stat(id) };
  });
}
const crownsTaken = (sim: SimState, by: 0 | 1) => {
  const enemy = sim.towers.filter((t) => t.owner !== by);
  const king = enemy.find((t) => t.kind === 'king');
  if (king && king.hp <= 0) return 3;
  return enemy.filter((t) => t.kind === 'princess' && t.hp <= 0).length;
};

export function Battle() {
  const practice = localStorage.getItem('mempire:practice') === '1';
  const matchId = practice ? null : BigInt(localStorage.getItem('mempire:activeMatch') || '0');
  const arena = useChainStore((s) => s.arena);
  const deployment = useChainStore((s) => s.deployment);
  const address = useWallet().data?.address;
  const market = useMarket();
  const sim = useMatch((s) => s.sim);
  const setSim = useMatch((s) => s.set);
  const resetSim = useMatch((s) => s.reset);
  // A fresh screen never shows the last match's board.
  useEffect(() => { resetSim(); return () => resetSim(); }, [resetSim]);
  const perspective = useMatch((s) => s.perspective);
  const [runner, setRunner] = useState<MatchRunner | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [txs, setTxs] = useState<TxRow[]>([]);
  const [claim, setClaim] = useState<{ winner: number; endTick: number } | null>(null);
  const [error, setError] = useState('');
  const [match, setMatch] = useState<ChainMatch | null>(null);
  const [settlement, setSettlement] = useState<Settlement | null>(null);
  const [busy, setBusy] = useState('');
  const [practiceMarket, setPracticeMarket] = useState<'live' | 'neutral' | null>(null);
  const [replay, setReplay] = useState<{ data: Replay; playing: boolean; speed: number; done: boolean } | null>(null);
  const [replayError, setReplayError] = useState('');
  const [stripSide, setStripSide] = useState<'you' | 'foe'>('you');
  const practiceRef = useRef<{ sim: SimState; inputs: InputEvent[] } | null>(null);
  const replayRef = useRef<SimState | null>(null);
  const sweepStarted = useRef(false);
  const resultSoundPlayed = useRef(false);

  // Practice: local sim + scripted bot, nothing on chain. It starts once the market read is in (or failed).
  const marketReady = !market.loading || !!market.error;
  useEffect(() => {
    if (!practice || !marketReady || practiceRef.current) return;
    const { byId, error: marketError } = useMarketStore.getState();
    const stat = (id: number) => byId.get(id)?.statBps ?? 0;
    setPracticeMarket(marketError || byId.size === 0 ? 'neutral' : 'live');
    const state = createMatch(Math.floor(Math.random() * 2 ** 32), [cards(PRACTICE_YOU, stat), cards(PRACTICE_BOT, stat)], FORMATS.rush);
    practiceRef.current = { sim: state, inputs: [] };
    setSim(state, 0);
  }, [practice, marketReady, setSim]);
  useEffect(() => {
    if (!practice) return;
    const timer = setInterval(() => {
      const value = practiceRef.current;
      if (!value || value.sim.phase === 'ended') return;
      const input = decideBot(value.sim, 1, 'normal');
      if (input) value.inputs.push(input);
      stepSim(value.sim, value.inputs.filter((e) => e.tick === value.sim.tick));
      setSim(structuredClone(value.sim), 0);
    }, 50);
    return () => { clearInterval(timer); };
  }, [practice, setSim]);
  useEffect(() => () => { practiceRef.current = null; }, []);

  // Staked: the runner replays the on-chain play log and sends ours from the session key.
  useEffect(() => {
    if (practice || !arena || !address || !matchId) return;
    let active = true;
    let r: MatchRunner | null = null;
    const start = async () => {
      try {
        const m = await arena.match(matchId);
        if (!active) return;
        setMatch(m);
        if (m.state !== 2) return;
        const seat = m.p0.toLowerCase() === address.toLowerCase() ? 0 : m.p1.toLowerCase() === address.toLowerCase() ? 1 : null;
        if (seat === null) throw new Error('This wallet is not a player in this match');
        const key = localStorage.getItem(`mempire:session:${matchId}`) as Hex | null;
        if (!key) throw new Error('The session key for this match is not in this browser. Plays can only come from the browser that staked.');
        r = new MatchRunner({
          publicClient, sessionWallet: walletFor(privateKeyToAccount(key)), arena: arena.arena, matchId, seat,
          choosePlay: () => null,
          onEvent: (e: RunnerEvent) => {
            if (!active) return;
            if (e.type === 'state') setSim(e.state, seat);
            else if (e.type === 'error') {
              // A play the arena refuses (it landed more than 3 s after its tick) is part of the game, not a failure.
              if (/outside the allowed window/.test(e.error.message)) setTxs((old) => [...old.slice(-40), { key: `late-${Date.now()}`, label: 'A late play was refused by the arena (over 3 s behind its tick)', state: 'no' }]);
              else setError(e.error.message);
            }
            else if (e.type === 'claim') setClaim({ winner: e.winner, endTick: e.endTick });
            else if (e.type === 'txSent') setTxs((old) => [...old.slice(-40), { key: e.hash, label: e.action === 'play' ? 'Your play' : 'Your claim', hash: e.hash, ms: e.ms, state: 'sent' }]);
            else if (e.type === 'txConfirmed') setTxs((old) => old.map((t) => (t.key === e.hash ? { ...t, state: 'ok', ms: e.ms } : t)));
            else if (e.type === 'opponentPlay') setTxs((old) => [...old.slice(-40), { key: `o${e.input.tick}-${e.input.deckIndex}-${old.length}`, label: `Opponent dropped slot ${e.input.deckIndex + 1} at tick ${e.input.tick}`, state: 'in' }]);
          },
        });
        await r.init();
        if (active) { setRunner(r); void r.run().catch((e) => setError((e as Error).message)); }
      } catch (e) { if (active) setError((e as Error).message); }
    };
    void start();
    return () => { active = false; r?.stop(); };
  }, [practice, arena, address, matchId, setSim]);

  // Settlement watcher: the result only speaks once the chain has spoken.
  useEffect(() => {
    if (practice || !arena || !matchId) return;
    const check = async () => {
      try {
        const m = await arena.match(matchId);
        setMatch(m);
        if (m.state === 3 && !settlement) {
          const logs = await publicClient.getContractEvents({ address: arena.arena, abi: arenaAbi, eventName: 'MatchSettled', args: { matchId }, fromBlock: BigInt(deployment?.block ?? 0) });
          const log = logs.at(-1);
          if (log) {
            const awarded = await publicClient.getContractEvents({ address: arena.arena, abi: arenaAbi, eventName: 'PointsAwarded', fromBlock: log.blockNumber, toBlock: log.blockNumber });
            const points = awarded.find((e) => e.transactionHash === log.transactionHash)?.args.points ?? 0n;
            setSettlement({ paid: log.args.paid ?? 0n, burned: log.args.burned ?? 0n, toSeason: log.args.toSeason ?? 0n, winner: log.args.winner ?? 2, points, hash: log.transactionHash });
            setError('');
            window.dispatchEvent(new Event('mempire:chain-changed'));
          }
        }
      } catch (e) { setError((e as Error).message); }
    };
    void check();
    const timer = setInterval(check, 2000);
    return () => clearInterval(timer);
  }, [practice, arena, matchId, settlement, deployment]);

  // Return the session key's leftover gas to the player once settled.
  useEffect(() => {
    if (!settlement || !arena || !address || !matchId || sweepStarted.current) return;
    const key = localStorage.getItem(`mempire:session:${matchId}`) as Hex | null;
    if (!key) return;
    sweepStarted.current = true;
    void new ArenaClient(publicClient, arena.arena, walletFor(privateKeyToAccount(key))).sweepSession(address)
      .then((hash) => { if (hash) { localStorage.setItem(`mempire:sweep:${matchId}`, hash); setTxs((old) => [...old, { key: hash, label: 'Leftover gas swept back to you', hash, state: 'ok' }]); } })
      .catch((e) => { sweepStarted.current = false; setError((e as Error).message); });
  }, [settlement, arena, address, matchId]);

  const seat: 0 | 1 = match && address && match.p1.toLowerCase() === address.toLowerCase() ? 1 : 0;
  useEffect(() => {
    if (!settlement || resultSoundPlayed.current || settlement.winner === 2 || replay) return;
    resultSoundPlayed.current = true;
    void new Audio(settlement.winner === seat ? '/sfx/sfx_victory.mp3' : '/sfx/sfx_defeat.mp3').play().catch(() => {});
  }, [settlement, seat, replay]);

  // Replay playback from the chain's own log.
  useEffect(() => {
    if (!replay?.playing) return;
    const timer = setInterval(() => {
      const st = replayRef.current;
      if (!st) return;
      for (let i = 0; i < replay.speed && st.phase !== 'ended'; i++) stepSim(st, replay.data.inputs.filter((e) => e.tick === st.tick));
      setSim(cloneState(st), seat);
      if (st.phase === 'ended') setReplay((r) => (r ? { ...r, playing: false, done: true } : r));
    }, 50);
    return () => clearInterval(timer);
  }, [replay?.playing, replay?.speed, replay?.data, seat, setSim]);

  async function startReplay() {
    if (!arena || !matchId) return;
    setReplayError(''); setBusy('Rebuilding the match from chain');
    try {
      const data = await replayMatch(arena, BigInt(deployment?.block ?? 0), matchId);
      replayRef.current = cloneState(data.initial);
      setSim(cloneState(data.initial), seat);
      setReplay({ data, playing: true, speed: 2, done: false });
    } catch (e) { setReplayError((e as Error).message); } finally { setBusy(''); }
  }

  function place(x: number, y: number) {
    if (selected === null || !sim || sim.phase === 'ended' || replay) return;
    const card = sim.players[perspective].deck[selected];
    const point = card.archetype === Archetype.Spell ? { x, y } : dropDecision(perspective, x, y);
    if (!point) return;
    const xFp = Math.round(point.x * FP), yFp = Math.round(point.y * FP);
    if (practice) practiceRef.current?.inputs.push({ tick: practiceRef.current.sim.tick + 2, player: 0, deckIndex: selected, x: xFp, y: yFp });
    else {
      try { runner?.queuePlay(selected, xFp, yFp); } catch (e) { setError((e as Error).message); return; }
    }
    void new Audio('/sfx/sfx_deploy.mp3').play().catch(() => {});
    setSelected(null);
  }

  async function timeout() {
    if (!arena || !matchId) return;
    setBusy('Claiming timeout');
    try {
      const key = localStorage.getItem(`mempire:session:${matchId}`) as Hex | null;
      if (!key) throw new Error('Session key missing in this browser');
      const hash = await new ArenaClient(publicClient, arena.arena, walletFor(privateKeyToAccount(key))).claimTimeout(matchId);
      await publicClient.waitForTransactionReceipt({ hash });
    } catch (e) { setError((e as Error).message); } finally { setBusy(''); }
  }

  if (!practice && !matchId) {
    return (
      <div className="section">
        <StateBox art title="No match in progress" action={<Link className="key key--sm" to="/#play">Pick a fight</Link>}>Open or join a staked match from the Arena, or play a free practice match.</StateBox>
      </div>
    );
  }

  const me = sim?.players[perspective];
  const hand = me?.cycle.slice(0, 4) ?? [];
  const next = me?.cycle[4];
  const elixir = me ? me.elixirFP / FP : 0;
  const cap = sim ? sim.format.elixirCapFP / FP : 10;
  const regulation = sim?.format.regulationTicks ?? 0;
  const overtime = sim ? sim.tick >= regulation : false;
  const remainingTicks = sim ? (overtime ? regulation + sim.format.overtimeTicks - sim.tick : regulation - sim.tick) : 0;
  const clock = Math.max(0, Math.ceil(remainingTicks / 20));
  const myCrowns = sim ? crownsTaken(sim, perspective) : 0;
  const theirCrowns = sim ? crownsTaken(sim, (1 - perspective) as 0 | 1) : 0;
  const opponent = match ? (seat === 0 ? match.p1 : match.p0) : null;
  const ended = sim?.phase === 'ended';
  const deadline = match ? Number(match.deadline) : 0;
  const canTimeout = !!match && match.state === 2 && Date.now() / 1000 > deadline;
  const closed = !!settlement || match?.state === 3 || match?.state === 4;
  const selectedCard = selected !== null && sim ? sim.players[perspective].deck[selected] : null;
  const showCeremony = (!replay || replay.done) && ((practice && ended) || !!settlement || match?.state === 4 || (!practice && ended && !closed));
  const myDeckIds = match ? (seat === 0 ? match.deck0 : match.deck1) : sim ? sim.players[perspective].deck.map((c) => c.fighterId) : [];
  const slotBase = seat === 0 ? 0 : 8;

  const steps = [
    { t: 'Both stakes escrowed', s: match ? `${formatWif(match.stake * 2n, 0)} WIF pot · ${TIER_NAMES[match.tier]} · ${FORMAT_NAMES[match.format]}` : '', done: !!match },
    { t: 'Market read on chain', s: 'The join transaction read 16 Chainlink feeds', done: !!match },
    { t: 'Playing', s: 'Each drop is a transaction; the chain is the clock', done: ended || closed, now: !ended && !closed },
    { t: 'Both seats claim', s: claim ? `You claimed ${claim.winner === 2 ? 'a tie' : claim.winner === seat ? 'a win' : 'a loss'} at tick ${claim.endTick}` : 'After the log closes, 3 s past the final tick', done: !!settlement || match?.state === 4, now: ended && !closed },
    { t: 'Settled', s: settlement ? 'Paid, burned and pooled in one transaction' : match?.state === 4 ? 'Voided: both stakes refunded' : 'The second matching claim pays out', done: !!settlement || match?.state === 4 },
  ];

  const share = async () => {
    if (!settlement || !match || !matchId) return;
    const title = settlement.winner === 2 ? 'Tie' : settlement.winner === seat ? 'Victory' : 'Defeat';
    try {
      await downloadShareCard({
        title, matchId: matchId.toString(), tier: TIER_NAMES[match.tier], format: FORMAT_NAMES[match.format],
        pot: formatWif(match.stake * 2n, 0), paid: formatWif(settlement.winner === 2 ? settlement.paid / 2n : settlement.paid, 0),
        burned: formatWif(settlement.burned, 0), season: formatWif(settlement.toSeason, 0),
        deck: myDeckIds.map((id, i) => ({ id: Number(id), bps: Number(match.mods[slotBase + i]), live: match.status[slotBase + i] === 0 })), tx: settlement.hash,
      });
    } catch (e) { setError((e as Error).message); }
  };

  return (
    <div className="battle">
      <div className="arena-stack">
      {/* The market's verdict for this match, per slot: stored on chain at kick-off (staked) or today's live read (practice). */}
      <div className="mstrip" aria-label={practice ? 'Practice: today\'s live market read per fighter' : 'Market read stored on chain at kick-off'}>
        <button className={`chip ${stripSide === 'you' ? 'chip--gold' : 'chip--crimson'}`} style={{ minHeight: 40, flex: 'none' }}
          onClick={() => setStripSide((v) => (v === 'you' ? 'foe' : 'you'))} aria-label={`Showing ${stripSide === 'you' ? 'your' : 'the opponent\'s'} market read. Switch.`}>
          {stripSide === 'you' ? 'You' : 'Foe'}
        </button>
        {(() => {
          const side = stripSide === 'you' ? (match ? seat : 0) : (match ? 1 - seat : 1);
          const ids = match ? (side === 0 ? match.deck0 : match.deck1) : sim ? sim.players[side].deck.map((c) => c.fighterId) : [];
          return ids.map((id, i) => {
            const slot = side * 8 + i;
            const bps = match ? Number(match.mods[slot]) : sim ? sim.players[side].deck[i].metaBps ?? 0 : 0;
            const st = match ? match.status[slot] : fighter(Number(id)).kind === 'house' ? 1 : 0;
            const lab = statusLabel(st);
            return (
              <div key={slot} className="mslot" title={`${fighter(Number(id)).ticker} · ${lab.long}`}>
                <Avatar id={Number(id)} size={26} ring={stripSide === 'you' ? 'gold' : 'crimson'} />
                {lab.live || (practice && st === 0) ? <MoveChip statBps={bps} small /> : <span className="move move--flat move--sm">{st === 1 ? '—' : lab.short}</span>}
              </div>
            );
          });
        })()}
      </div>

      <div className="bhud bhud--row">
          <span className="plate plate--foe">
            <Avatar id={sim?.players[1 - perspective]?.deck[0]?.fighterId ?? 0} size={30} ring="crimson" />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{practice ? 'Practice bot' : opponent ? <span className="mono">{shortAddr(opponent)}</span> : 'Loading…'}</span>
          </span>
          <span className={`clock${overtime ? ' clock--ot' : ''}`} aria-live="polite">
            <b>{sim ? `${Math.floor(clock / 60)}:${String(clock % 60).padStart(2, '0')}` : '–:––'}</b>
            <span className="crowns" aria-label={`You ${myCrowns}, opponent ${theirCrowns} crowns`}><span className="me">{myCrowns}</span><Icon name="crown" size={15} /><span className="them">{theirCrowns}</span></span>
          </span>
        </div>
      <div style={{ position: 'relative' }}>
        <BattleBoard perspective={perspective} placing={selected !== null && !replay} spell={selectedCard?.archetype === Archetype.Spell}
          onPlace={place} label={selectedCard ? `Tap where ${selectedCard.name} should land` : 'Battle arena'} />
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

      {sim && <div className="hand-bar">
        <div className="elixir" role="meter" aria-label="Elixir" aria-valuemin={0} aria-valuemax={cap} aria-valuenow={Math.floor(elixir)}>
          <div className="elixir-fill" style={{ width: `${(elixir / cap) * 100}%` }} />
          <div className="elixir-ticks">{Array.from({ length: 10 }, (_, i) => <span key={i} />)}</div>
          <span className="elixir-num">{Math.floor(elixir)}</span>
        </div>
        <div className="hand">
          {sim && hand.map((slot) => {
            const card = sim.players[perspective].deck[slot];
            const afford = elixir >= costOf(card.fighterId);
            return (
              <FighterCard key={slot} id={card.fighterId} size="sm" picked={selected === slot} className={afford ? '' : 'unaffordable'}
                statBps={card.metaBps ?? 0} pulse={fighter(card.fighterId).kind === 'house' ? 'house' : null}
                disabled={ended || !!replay || (!practice && !runner)} onClick={() => setSelected(selected === slot ? null : slot)}
                label={`${card.name}, ${costOf(card.fighterId)} elixir, market ${pct(card.metaBps ?? 0)}${afford ? '' : ', not enough elixir yet'}`} />
            );
          })}
          {sim && next !== undefined && (
            <div className="next"><span className="label" style={{ fontSize: 10 }}>Next</span><FighterCard id={sim.players[perspective].deck[next].fighterId} size="xs" showName={false} /></div>
          )}
        </div>
        <p className="hint" aria-live="polite">
          {replay ? `Replaying ${replay.data.plays} on-chain plays through the same sim.` : !sim ? '' : ended ? 'Battle over.'
            : selectedCard ? `Tap ${selectedCard.archetype === Archetype.Spell ? 'anywhere' : 'your half'} to drop ${selectedCard.name}.` : 'Pick a card, then tap your half of the arena.'}
        </p>
      </div>}

        {!sim && !showCeremony && (
        <div className="ceremony" style={{ background: 'rgba(3,12,13,.55)' }}>
          <div className="cer-card">
            {closed ? (
              <>
                <p className="fine">This match is over. Its result is read from the chain.</p>
                <button className="key key--ghost" disabled={!!busy} onClick={() => void startReplay()}>{busy ? <span className="spinner" /> : <Icon name="replay" />}{busy || 'Replay from chain'}</button>
              </>
            ) : <p className="fine" role="status"><span className="spinner" /> {practice ? 'Reading today\'s market for your fighters…' : 'Loading the match from chain…'}</p>}
          </div>
        </div>
      )}
      {showCeremony && (
        <Ceremony practice={practice} sim={sim} seat={seat} settlement={settlement} match={match} claim={claim} deadline={deadline} canTimeout={canTimeout}
          busy={busy} onTimeout={() => void timeout()} onShare={() => void share()} onReplay={() => void startReplay()} replay={replay?.data ?? null} replayError={replayError} />
      )}
      </div>

      <div className="section stack" style={{ gap: 14, paddingBottom: 24 }}>
        {error && !settlement && <StateBox kind="error" title="Something failed">{shortError(error, 240)}</StateBox>}
        {practice ? (
          <section className="panel stack">
            <h2 className="display h3 ivory">Practice</h2>
            <p className="fine">{practiceMarket === 'live'
              ? 'A local match against the scripted bot, with today\'s live Chainlink read on every fighter (the same 2x formula the arena stores at kick-off). Nothing is staked and nothing touches the chain.'
              : 'A local match against the scripted bot. The market read was unavailable, so every fighter is neutral. Nothing is staked and nothing touches the chain.'}</p>
            <div className="row" style={{ flexWrap: 'nowrap' }}>
              <button className="key key--ghost key--sm" style={{ flex: 1 }} onClick={() => window.location.reload()}>Restart</button>
              <Link className="key key--sm" style={{ flex: 1 }} to="/#play">Stake $WIF</Link>
            </div>
          </section>
        ) : (
          <>
            <section className="panel stack" aria-labelledby="m-title">
              <div className="panel-head">
                <h2 id="m-title" className="display h3 ivory">Match #{matchId?.toString()}</h2>
                {match && <span className={`chip ${match.state === 2 ? 'chip--live' : match.state === 3 ? 'chip--gold' : ''}`}>{['None', 'Open', 'Live', 'Settled', 'Refunded'][match.state] ?? match.state}</span>}
              </div>
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
              {txs.length === 0 ? <p className="fine">{closed ? 'Every drop of this match is a Played event on the arena; Replay from chain rebuilds it from those events. This list shows plays sent from this tab only.' : 'No plays yet. Your drops are sent from this match\'s session key, so no wallet pop-ups.'}</p> : (
                <ul className="list">
                  {[...txs].reverse().map((t) => (
                    <li key={t.key} className="list-row">
                      <span className={`chip ${t.state === 'in' ? 'chip--crimson' : t.state === 'ok' ? 'chip--jade' : t.state === 'no' ? 'chip--crimson' : ''}`}>{t.state === 'in' ? 'In' : t.state === 'ok' ? 'Mined' : t.state === 'no' ? 'Refused' : 'Sent'}</span>
                      <span className="t" style={{ fontWeight: 600, fontSize: 14 }}>{t.label}{t.ms != null && t.state === 'ok' ? ` · ${t.ms} ms` : ''}</span>
                      {t.hash ? <TxLink hash={t.hash}>{t.hash.slice(0, 8)}…</TxLink> : <span />}
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

function Ceremony({ practice, sim, seat, settlement, match, claim, deadline, canTimeout, busy, onTimeout, onShare, onReplay, replay, replayError }: {
  practice: boolean; sim: SimState | null; seat: 0 | 1; settlement: Settlement | null; match: ChainMatch | null; claim: { winner: number; endTick: number } | null;
  deadline: number; canTimeout: boolean; busy: string; onTimeout: () => void; onShare: () => void; onReplay: () => void; replay: Replay | null; replayError: string;
}) {
  if (practice && sim) {
    const result = sim.winner === -2 ? 'Draw' : sim.winner === 0 ? 'Victory' : 'Defeat';
    return (
      <div className={`ceremony${result === 'Defeat' ? ' ceremony--defeat' : ''}`}>
        <div className="cer-card">
          <img className="cer-crest" src={result === 'Defeat' ? '/brand/v2/fx-defeat.webp' : '/brand/v2/fx-victory.webp'} alt="" aria-hidden />
          <h2 className={`cer-title ${result === 'Defeat' ? '' : 'gold-text'}`}>{result}</h2>
          <p className="fine">Practice match: nothing was staked and nothing was written on chain.</p>
          <div className="row" style={{ flexWrap: 'nowrap', width: '100%' }}>
            <button className="key key--sm" style={{ flex: 1 }} onClick={() => window.location.reload()}>Play again</button>
            <Link className="key key--ghost key--sm" style={{ flex: 1 }} to="/#play">Stake $WIF</Link>
          </div>
        </div>
      </div>
    );
  }
  if (settlement && match) {
    const result = settlement.winner === 2 ? 'Tie' : settlement.winner === seat ? 'Victory' : 'Defeat';
    const pot = match.stake * 2n;
    return (
      <div className={`ceremony${result === 'Defeat' ? ' ceremony--defeat' : ''}`}>
        <div className="cer-card">
          <img className="cer-crest" src={result === 'Defeat' ? '/brand/v2/fx-defeat.webp' : '/brand/v2/fx-victory.webp'} alt="" aria-hidden />
          <h2 className={`cer-title ${result === 'Defeat' ? '' : 'gold-text'}`}>{result}</h2>
          <div className="cer-pot">
            <div className="cer-row" style={{ opacity: 1, animation: 'none' }}><span className="label">The pot · {TIER_NAMES[match.tier]}</span><Big value={formatWif(pot, 0)} unit="WIF" tone="ivory" /></div>
            <div className="cer-split" aria-hidden><i /><i /><i /></div>
            <div className="cer-row"><span className="label">{result === 'Tie' ? 'Paid to each of you' : result === 'Victory' ? 'Paid to you · 92%' : 'Paid to your opponent · 92%'}</span><Big value={formatWif(result === 'Tie' ? settlement.paid / 2n : settlement.paid, 0)} unit="WIF" tone="gold" /></div>
            <div className="cer-row"><span className="row" style={{ gap: 6, flexWrap: 'nowrap' }}><span className="burn-fx"><img src="/brand/v2/fx-burn.webp" alt="" aria-hidden /></span><span className="label">Burned for good · 5%</span></span><Big value={formatWif(settlement.burned, 0)} unit="WIF" tone="ember" /></div>
            <div className="cer-row"><span className="label">To the season pool · 3%</span><Big value={formatWif(settlement.toSeason, 0)} unit="WIF" tone="sapphire" /></div>
            {settlement.points > 0n && <div className="cer-row"><span className="label">Ladder points to the winner</span><Big value={`+${settlement.points.toString()}`} tone="sapphire" /></div>}
          </div>
          {replay ? (
            <div className={`verify${replay.claims.every((c) => c.matches) ? '' : ' verify--bad'}`} role="status">
              <Icon name="shield" size={22} />
              <div className="stack" style={{ gap: 2 }}>
                <b>{replay.claims.every((c) => c.matches) ? 'Verified: the replay matches both claims' : 'Mismatch: the replay disagrees with a claim'}</b>
                <span className="fine">{replay.plays} on-chain plays replayed to tick {replay.final.tick}. State hash <span className="mono">…{replay.finalHash.slice(-8)}</span>{replay.claims.map((c) => ` · seat ${c.seat} ${c.made ? (c.matches ? 'matches' : 'differs') : 'no claim'}`).join('')}.</span>
              </div>
            </div>
          ) : replayError ? <StateBox kind="error" title="Replay failed">{shortError(replayError, 240)}</StateBox> : null}
          <p className="fine">Settlement transaction <TxLink hash={settlement.hash} /></p>
          <div className="row" style={{ flexWrap: 'nowrap', width: '100%' }}>
            <button className="key key--sm" style={{ flex: 1 }} onClick={onShare}><Icon name="share" size={18} />Share card</button>
            <button className="key key--ghost key--sm" style={{ flex: 1 }} disabled={!!busy} onClick={onReplay}>{busy ? <span className="spinner" /> : <Icon name="replay" size={18} />}{replay ? 'Watch again' : 'Replay & verify'}</button>
          </div>
          <Link className="fine" to="/#play">Fight again</Link>
        </div>
      </div>
    );
  }
  if (match?.state === 4) {
    return (
      <div className="ceremony ceremony--defeat">
        <div className="cer-card">
          <h2 className="cer-title">Refunded</h2>
          <p className="fine">Fewer than two matching claims arrived, so the arena returned both stakes in full and burned nothing.</p>
          <Link className="key key--sm" to="/#play">Arena</Link>
        </div>
      </div>
    );
  }
  return (
    <div className="ceremony">
      <div className="cer-card">
        <h2 className="cer-title ivory" style={{ fontSize: 44 }}>Waiting for the chain</h2>
        <div className="panel stack" style={{ textAlign: 'left' }}>
          <p className="fine">The battle is over on screen. The pot moves only when both claims land on chain{claim ? '' : ' (yours is sent automatically once the play log closes)'}.</p>
          <p className="fine">If your opponent never claims, a lone claim does not pay out: after the deadline either seat can refund both stakes. Deadline in <Countdown to={deadline} />.</p>
          {canTimeout && <button className="key key--sm" disabled={!!busy} onClick={onTimeout}>{busy ? <span className="spinner" /> : null}Refund by timeout</button>}
        </div>
      </div>
    </div>
  );
}
