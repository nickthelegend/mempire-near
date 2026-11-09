// SPDX-License-Identifier: MIT
// Plays one match: rebuilds the board from the arena's stored play log (and the house bot, run the
// same way the referee runs it), sends this seat's drops from the per-match session key, and once
// the log closes asks the referee to settle with the result this client computed.
import {
  cloneState, hashState, initialState, matchCards, refereeStep, HOUSE_DIFFICULTY,
  type BotDifficulty, type InputEvent, type SimState,
} from '@mempire/sim';
import { arenaCalls, ArenaReader, PLAY_LEAD_TICKS, roster, type Claim, type MatchView } from './arena';
import { latestBlock, type Network } from './rpc';
import type { KeySigner } from './tx';

export type RunnerEvent =
  | { type: 'state'; state: SimState }
  | { type: 'playSent'; hash: string; tick: number; deckIndex: number }
  | { type: 'playLanded'; hash: string; ms: number }
  | { type: 'playRefused'; hash: string; error: string }
  | { type: 'opponentPlay'; input: InputEvent }
  | { type: 'claim'; claim: Claim }
  | { type: 'match'; match: MatchView }
  | { type: 'error'; error: Error };

export interface RunnerOptions {
  net: Network;
  matchId: string;
  seat: 0 | 1;
  /** The session key signer (function-call key limited to `play`); null to watch only. */
  session: KeySigner | null;
  /** Called once the log has closed with the locally computed result; should send `settle`. */
  settle?: (claim: Claim) => Promise<void>;
  onEvent?: (event: RunnerEvent) => void;
  pollMs?: number;
}

interface Snap { state: SimState; pending: InputEvent[] }

export class MatchRunner {
  private reader: ArenaReader;
  private m!: MatchView;
  private initial!: SimState;
  private state!: SimState;
  private pending: InputEvent[] = [];
  private house: BotDifficulty | null = null;
  private inputs: InputEvent[] = [];
  private seen = 0;
  private snaps = new Map<number, Snap>();
  private offsetMs = 0;
  private startMs = 0;
  private closeMs = 0;
  private maxTick = 0;
  private lastSent = -1;
  private queued: { deckIndex: number; x: number; y: number }[] = [];
  private stopped = false;
  private settling = false;

  constructor(readonly opts: RunnerOptions) { this.reader = new ArenaReader(opts.net); }
  private emit(e: RunnerEvent) { this.opts.onEvent?.(e); }

  async init() {
    const m = await this.reader.match(this.opts.matchId);
    if (!m) throw new Error(`Match #${this.opts.matchId} does not exist`);
    if (m.state === 1) throw new Error(`Match #${this.opts.matchId} is waiting for an opponent`);
    this.m = m;
    this.emit({ type: 'match', match: m });
    this.house = m.house === null ? null : HOUSE_DIFFICULTY[(await this.reader.houses())[m.house]?.difficulty ?? 1];
    this.initial = initialState(m.seed, [matchCards(roster.fighters, m.deck0, m.mods.slice(0, 8)), matchCards(roster.fighters, m.deck1, m.mods.slice(8))], m.format);
    this.state = cloneState(this.initial);
    this.snaps.set(0, { state: cloneState(this.state), pending: [] });
    this.startMs = Number(m.start_ms);
    this.closeMs = Number(m.close_ms);
    this.maxTick = m.format === 0 ? 4800 : 600;
    await this.syncClock();
    await this.pollPlays();
    this.emit({ type: 'state', state: cloneState(this.state) });
  }

  /** Chain time minus local time, from the latest optimistic block (a lower bound). */
  private async syncClock() {
    const t0 = Date.now();
    const b = await latestBlock(this.opts.net.rpc, 'optimistic');
    const t1 = Date.now();
    const chainMs = Number(BigInt(b.timestamp_nanosec) / 1_000_000n);
    this.offsetMs = chainMs - (t0 + t1) / 2;
  }
  chainNow() { return Date.now() + this.offsetMs; }
  currentTick() { return Math.max(0, Math.floor(((this.chainNow() - this.startMs) * 20) / 1000)); }
  get match() { return this.m; }
  get closeAt() { return this.closeMs; }

  queuePlay(deckIndex: number, x: number, y: number) {
    if (!this.opts.session) throw new Error('This browser has no session key for this match');
    if (!Number.isInteger(deckIndex) || deckIndex < 0 || deckIndex > 7) throw new Error('Invalid play');
    this.queued.push({ deckIndex, x: Math.max(0, Math.min(65535, Math.round(x))), y: Math.max(0, Math.min(65535, Math.round(y))) });
  }

  private async pollPlays() {
    const fresh = await this.reader.plays(this.opts.matchId, this.seen);
    if (!fresh.length) return;
    this.seen += fresh.length;
    let rewind = Infinity;
    for (const p of fresh) {
      const input: InputEvent = { tick: p.tick, player: p.seat, deckIndex: p.deck_index, x: p.x, y: p.y };
      this.inputs.push(input);
      if (input.tick < this.state.tick) rewind = Math.min(rewind, input.tick);
      if (input.player !== this.opts.seat) this.emit({ type: 'opponentPlay', input });
    }
    if (rewind < Infinity) this.rewind(rewind);
  }

  private rewind(tick: number) {
    const at = [...this.snaps.keys()].filter((t) => t <= tick).reduce((a, b) => Math.max(a, b), 0);
    const target = this.state.tick;
    const snap = this.snaps.get(at)!;
    this.state = cloneState(snap.state);
    this.pending = snap.pending.map((e) => ({ ...e }));
    for (const k of [...this.snaps.keys()]) if (k > at) this.snaps.delete(k);
    this.advance(target);
  }

  private advance(target: number) {
    while (this.state.tick < Math.min(target, this.maxTick + 1) && this.state.phase !== 'ended') {
      refereeStep(this.state, this.inputs, this.house, this.pending);
      if (this.state.tick % 20 === 0) this.snaps.set(this.state.tick, { state: cloneState(this.state), pending: this.pending.map((e) => ({ ...e })) });
    }
  }

  private sendQueued() {
    const session = this.opts.session;
    if (!session || !this.queued.length || this.state.phase === 'ended') return;
    const now = this.currentTick();
    if (this.chainNow() < this.startMs + 100) return;
    const tick = Math.max(now + PLAY_LEAD_TICKS, this.lastSent);
    if (tick > this.maxTick) { this.queued = []; return; }
    const q = this.queued.shift()!;
    this.lastSent = tick;
    const t0 = Date.now();
    let hash = '';
    void session.send(this.opts.net.arena, [arenaCalls.play(this.opts.matchId, tick, q.deckIndex, q.x, q.y)], (h) => {
      hash = h; this.emit({ type: 'playSent', hash: h, tick, deckIndex: q.deckIndex });
    }).then((out) => {
      if (out.ok) this.emit({ type: 'playLanded', hash: out.hash, ms: Date.now() - t0 });
      else this.emit({ type: 'playRefused', hash: out.hash, error: out.error ?? 'refused' });
    }).catch((e) => this.emit({ type: 'playRefused', hash, error: (e as Error).message }));
  }

  /** The result this client computes from the full on-chain log: exactly what the referee runs. */
  localResult(): Claim {
    const s = cloneState(this.initial);
    const pending: InputEvent[] = [];
    while (s.phase !== 'ended') refereeStep(s, this.inputs, this.house, pending);
    return { winner: s.winner === -2 ? 2 : s.winner, end_tick: s.tick, final_hash: hashState(s) };
  }

  async poll() {
    await this.pollPlays();
    this.advance(this.currentTick());
    this.sendQueued();
    this.emit({ type: 'state', state: cloneState(this.state) });
    if (this.chainNow() >= this.closeMs + 1500 && !this.settling) {
      const m = await this.reader.match(this.opts.matchId);
      if (m) { this.m = m; this.emit({ type: 'match', match: m }); }
      if (m && m.state !== 2) { this.stopped = true; return; }
      await this.pollPlays();
      const claim = this.localResult();
      this.emit({ type: 'claim', claim });
      if (this.opts.settle) {
        this.settling = true;
        try { await this.opts.settle(claim); } catch (e) { this.emit({ type: 'error', error: e as Error }); }
        finally { this.settling = false; }
      }
      const after = await this.reader.match(this.opts.matchId);
      if (after) { this.m = after; this.emit({ type: 'match', match: after }); if (after.state !== 2) this.stopped = true; }
    }
  }

  async run() {
    if (!this.state) await this.init();
    let n = 0;
    while (!this.stopped) {
      try { await this.poll(); if (++n % 40 === 0) await this.syncClock(); }
      catch (e) { this.emit({ type: 'error', error: e as Error }); }
      await new Promise((r) => setTimeout(r, this.opts.pollMs ?? 250));
    }
  }
  stop() { this.stopped = true; }
  getInputs() { return [...this.inputs]; }
  getInitial() { return cloneState(this.initial); }
}

/** Rebuild a finished (or running) match from the chain alone, for replay and verification. */
export async function replayFromChain(net: Network, id: string) {
  const reader = new ArenaReader(net);
  const m = await reader.match(id);
  if (!m) throw new Error(`Match #${id} does not exist`);
  if (m.state === 1) throw new Error(`Match #${id} has not started`);
  const plays = await reader.plays(id, 0);
  const house = m.house === null ? null : HOUSE_DIFFICULTY[(await reader.houses())[m.house]?.difficulty ?? 1];
  const initial = initialState(m.seed, [matchCards(roster.fighters, m.deck0, m.mods.slice(0, 8)), matchCards(roster.fighters, m.deck1, m.mods.slice(8))], m.format);
  const inputs: InputEvent[] = plays.map((p) => ({ tick: p.tick, player: p.seat, deckIndex: p.deck_index, x: p.x, y: p.y }));
  const s = cloneState(initial);
  const pending: InputEvent[] = [];
  while (s.phase !== 'ended') refereeStep(s, inputs, house, pending);
  const result = { winner: s.winner === -2 ? 2 : s.winner, end_tick: s.tick, final_hash: hashState(s) };
  return { match: m, initial, inputs, house, final: s, result, matchesChain: m.state === 3 && m.final_hash === result.final_hash && m.end_tick === result.end_tick && m.winner === result.winner };
}
