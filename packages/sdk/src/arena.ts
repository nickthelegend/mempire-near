// SPDX-License-Identifier: MIT
// Typed reads of the arena contract (packages/contract/src/lib.rs views) and call builders.
import { view, type Network } from './rpc';
import { fnCall, type KeySigner } from './tx';
import rosterJson from '../../../shared/roster.json';

export const roster = rosterJson as {
  network: string;
  priceSource: { label: string; url: string; note: string };
  fighters: { fighterId: number; ticker: string; name: string; kind: 'house' | 'market'; archetype: number; archetypeName: string; art: string }[];
};
export type Deck = readonly number[];

export const OPEN = 1, ACTIVE = 2, SETTLED = 3, VOID = 4;
export const STATE_NAMES: Record<number, string> = { 1: 'Open', 2: 'Live', 3: 'Settled', 4: 'Refunded' };
export const TIER_NAMES = ['Pauper', 'Knight', 'Duke', 'Emperor'] as const;
export const FORMAT_NAMES = ['Standard', 'Rush'] as const;
/** Ticks the client schedules a drop ahead of the chain clock: inclusion takes about 1 to 2.5 s. */
export const PLAY_LEAD_TICKS = 50;

export interface ArenaConfig {
  owner: string; treasury: string; relayer_pk: string; tier_stakes: string[];
  roster: { ticker: string; kind: number; archetype: number; trait_id: number }[];
  price_source: string; genesis_ms: string; first_season_end_ms: string; week_ms: string;
  start_delay_ms: number; late_ticks: number; early_ticks: number; max_plays: number;
  bps: { winner: number; season: number; treasury: number };
}
export interface MatchView {
  id: string; p0: string; p1: string | null; house: number | null; stake: string; tier: number; format: 0 | 1;
  state: number; winner: number; deck0: number[]; deck1: number[]; mods: number[]; status: number[]; seed: number;
  created_ms: string; start_ms: string; close_ms: string; plays0: number; plays1: number;
  session0: string | null; session1: string | null; end_tick: number; final_hash: number;
  paid: string; to_season: string; to_treasury: string; season: number; referee_calls: number; settled_ms: string;
  checkpoint_tick: number | null;
}
export interface Play { tick: number; seat: 0 | 1; deck_index: number; x: number; y: number }
/** Who supplied a fighter's price: OutLayer's TEE price oracle, the signed relayer fallback, or nobody yet. */
export type PriceSourceName = 'oracle' | 'relayer' | 'none';
export interface PriceRow { fighter_id: number; ticker: string; open_e8: string; last_e8: string; ts_ms: string; status: number; stat_bps: number; source?: PriceSourceName; oracle_asset?: string | null }
export interface Prices { source: string; oracle?: string | null; oracle_refreshes?: string; oracle_updates?: string; max_age_ms: string; prices: PriceRow[] }
export interface OracleFighter { ticker: string; asset: string | null; open_source: string | null; spot_e8: string; spot_ms: string; open_e8: string; open_ms: string; price_source: PriceSourceName }
export interface OracleView { oracle: string | null; min_deposit: string; refreshes: string; updates: string; fighters: OracleFighter[] }
export interface HouseView { index: number; account: string; name: string; difficulty: number; tier: number; stake: string; deck: number[]; treasury: string; in_play: string; wins: number; losses: number; draws: number }
export interface SeasonView { season: number; start_ms: string; end_ms: string; pool: string; top: { account: string; points: number }[]; finalized: boolean; paid: { account: string; amount: string }[]; rolled_over: string }
export interface Totals { matches: string; settled: string; volume: string; to_treasury: string; season_paid: string; refereed_ticks: string; houses: number }
export interface Stats { wins: number; losses: number; draws: number; streak: number; best_streak: number; matches: number; rejected_claims: number }
export interface Claim { winner: number; end_tick: number; final_hash: number }
export interface SettleOutcome { status: 'settled' | 'replaying'; tick: number; winner: number | null; end_tick: number | null; final_hash: number | null }

export class ArenaReader {
  constructor(readonly net: Network) {}
  private v<T>(method: string, args: unknown = {}) { return view<T>(this.net.rpc, this.net.arena, method, args); }
  config() { return this.v<ArenaConfig>('get_config'); }
  prices() { return this.v<Prices>('get_prices'); }
  oracle() { return this.v<OracleView>('get_oracle'); }
  houses() { return this.v<HouseView[]>('get_houses'); }
  match(id: string | number | bigint) { return this.v<MatchView | null>('get_match', { id: String(id) }); }
  plays(id: string | number | bigint, from = 0) { return this.v<Play[]>('get_plays', { id: String(id), from }); }
  recent(limit = 20, before?: string) { return this.v<MatchView[]>('recent_matches', { limit, before }); }
  openMatches() { return this.v<string[]>('open_matches'); }
  player(account: string) { return this.v<Stats>('get_player', { account }); }
  currentSeason() { return this.v<number>('current_season'); }
  season(season: number) { return this.v<SeasonView>('get_season', { season }); }
  points(season: number, account: string) { return this.v<number>('get_points', { season, account }); }
  totals() { return this.v<Totals>('get_totals'); }
}

/** Arena call builders: each returns the function-call action, for a direct send or a delegate. */
export const arenaCalls = {
  createMatch: (tier: number, format: number, deck: Deck, sessionKey: string | null, stake: string) =>
    fnCall('create_match', { tier, format, deck, session_key: sessionKey }, 30, stake),
  joinMatch: (id: string, deck: Deck, sessionKey: string | null, stake: string) =>
    fnCall('join_match', { id, deck, session_key: sessionKey }, 30, stake),
  challengeHouse: (house: number, format: number, deck: Deck, sessionKey: string | null, stake: string) =>
    fnCall('challenge_house', { house, format, deck, session_key: sessionKey }, 30, stake),
  cancel: (id: string) => fnCall('cancel_match', { id }, 30),
  play: (id: string, tick: number, deckIndex: number, x: number, y: number) =>
    fnCall('play', { id, tick, deck_index: deckIndex, x, y }, 15),
  settle: (id: string, claim: Claim | null) => fnCall('settle', { id, claim }, 200),
  finalizeSeason: (season: number) => fnCall('finalize_season', { season }, 100),
};

export async function settleUntilDone(signer: KeySigner, arena: string, id: string, claim: Claim | null) {
  const hashes: string[] = [];
  for (let i = 0; i < 20; i++) {
    const out = await signer.send(arena, [arenaCalls.settle(id, claim)]);
    hashes.push(out.hash);
    if (!out.ok) throw new Error(`settle failed: ${out.error} (tx ${out.hash})`);
    const v = out.value as SettleOutcome;
    if (v.status === 'settled') return { outcome: v, hashes, gasBurnt: out.gasBurnt };
  }
  throw new Error('settle did not finish in 20 calls');
}

export const YOCTO = 10n ** 24n;
export function formatNear(yocto: string | bigint, digits = 3): string {
  const v = BigInt(yocto);
  // small testnet amounts (a 0.0006 NEAR season share) keep four decimals instead of rounding to 0
  if (v > 0n && v < YOCTO) digits = Math.max(digits, 4);
  const whole = v / YOCTO;
  const frac = (v % YOCTO).toString().padStart(24, '0').slice(0, digits).replace(/0+$/, '');
  return frac ? `${whole.toLocaleString('en-US')}.${frac}` : whole.toLocaleString('en-US');
}
export function parseNear(n: string | number): bigint {
  const [w, f = ''] = String(n).split('.');
  return BigInt(w || '0') * YOCTO + BigInt((f + '0'.repeat(24)).slice(0, 24));
}
export const priceUsd = (e8: string) => Number(BigInt(e8)) / 1e8;
export function moveBps(open_e8: string, last_e8: string): number {
  const o = BigInt(open_e8); if (o === 0n) return 0;
  return Number(((BigInt(last_e8) - o) * 10000n) / o);
}
