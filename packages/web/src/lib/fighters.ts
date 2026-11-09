import { roster } from '@mempire/sdk';
import { ARCHETYPES } from '@mempire/sim';

export type Fighter = (typeof roster.fighters)[number];

export const fighter = (id: number): Fighter => {
  const f = roster.fighters[id];
  if (!f) throw new Error(`Unknown fighter ${id}`);
  return f;
};
/** Painted card art (v2): a 2:3 portrait per fighter, plus a small cut for hands, tokens and avatars. */
export const artOf = (id: number) => `/art/v2/${fighter(id).ticker.toLowerCase()}.webp`;
export const artSmallOf = (id: number) => `/art/v2/${fighter(id).ticker.toLowerCase()}-sm.webp`;
/** Card names shown under the ticker: house fighters by name, stocks by their character. */
export const CHARACTER: Record<string, string> = {
  WIF: 'dogwifhat', HATS: 'Hat Squad', DOGGO: 'Doggo', PENG: 'Peng', MOONCAT: 'Mooncat', RKT: 'Rocket',
  ETH: 'The Prism', SPY: 'The Five Hundred', QQQ: 'Hundred Engines', AMZN: 'Porter Colossus', TSLA: 'Volt Pack',
  INTC: 'Silicon Scarabs', GOOGL: 'The Seeker', META: 'Mirror Duelist', PLTR: 'The Seer', NVDA: 'Forge Warlock',
  AMD: 'Crimson Smelter', AAPL: 'Orchard Warden', MSFT: 'Pane Weaver', COIN: 'The Mintmaster', MSTR: 'Hoard Dragon',
};
export const characterOf = (id: number) => CHARACTER[fighter(id).ticker] ?? fighter(id).name;
/**
 * Frame rarity is earned from the market, not bought: house fighters are common, priced fighters rare,
 * and a priced fighter whose stat change is a buff (live read, or the match's stored bps) is epic.
 */
export type Rarity = 'common' | 'rare' | 'epic';
export function rarityOf(id: number, statBps: number | null | undefined): Rarity {
  if (fighter(id).kind === 'house') return 'common';
  return statBps != null && statBps > 0 ? 'epic' : 'rare';
}
export const costOf = (id: number) => ARCHETYPES[fighter(id).archetype as keyof typeof ARCHETYPES].elixir;
export const CLASS_SLUGS = ['tank', 'swarm', 'ranged', 'splash', 'support', 'spell'] as const;
export const CLASS_NAMES = ['Tank', 'Swarm', 'Ranged', 'Splash', 'Support', 'Spell'] as const;

/** Minimum holding as a readable amount (18-decimal tokens). */
export function minHoldLabel(f: Fighter): string {
  const n = Number(BigInt(f.minHold)) / 1e18;
  return `${n.toLocaleString('en-US', { maximumFractionDigits: 6 })} ${f.ticker === 'ETH' ? 'WETH' : f.ticker}`;
}

/** The contract's stat effect from a 24 h price move: twice the move, capped at ±15%. */
export function statBpsFromMove(moveBps: number): number {
  return Math.max(-1500, Math.min(1500, Math.trunc(moveBps * 2)));
}

export const pct = (bps: number, digits = 1) => `${bps > 0 ? '+' : bps < 0 ? '−' : '±'}${Math.abs(bps / 100).toFixed(digits)}%`;

/** On-chain MarketRead status codes (MempireArena: 0 live, 1 house, 2 stale, 3 paused, 4 no history). */
export function statusLabel(status: number): { short: string; long: string; live: boolean } {
  switch (status) {
    case 0: return { short: 'Live', long: 'Live Chainlink read', live: true };
    case 1: return { short: 'House', long: 'House fighter: no feed, always neutral', live: false };
    case 2: return { short: 'Closed', long: 'Feed older than 25 h (market closed or stale): neutral', live: false };
    case 3: return { short: 'Paused', long: 'Oracle paused for a corporate action: neutral', live: false };
    case 4: return { short: 'New feed', long: 'No 24 h history in this feed phase: neutral', live: false };
    default: return { short: 'Unknown', long: `Unknown status ${status}`, live: false };
  }
}

export const shortAddr = (a?: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '');
export const ZERO = '0x0000000000000000000000000000000000000000';
export const TIER_NAMES = ['Pauper', 'Knight', 'Duke', 'Emperor'] as const;
export const FORMAT_NAMES = ['Standard', 'Rush'] as const;

/** First readable line of an RPC or contract error, for a compact error state. */
export function shortError(message: string, max = 160): string {
  const first = message.split(/\n|Contract Call:|Request Arguments:|Docs:/)[0].trim();
  return first.length > max ? `${first.slice(0, max - 1)}…` : first;
}
