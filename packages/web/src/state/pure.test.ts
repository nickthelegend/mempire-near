import { describe, expect, it } from 'vitest';
import { validateDeck } from './deck';
import { formatWif, marketLabel } from './format';
import { forkFundingAllowed } from '../chain/wallet';
import { rarityOf, statBpsFromMove } from '../lib/fighters';
import { dropDecision } from '../battle/BattleBoard';
describe('app pure rules', () => {
  it('requires eight distinct eligible fighters', () => {
    expect(validateDeck([0,1,2,3,4,5,15,16], new Set([15,16]))).toBeNull();
    expect(validateDeck([0,1,2,3,4,5,15,15], new Set([15]))).toMatch(/distinct/);
    expect(validateDeck([0,1,2,3,4,5,15,16], new Set([15]))).toMatch(/AMD/);
  });
  it('formats 18-decimal WIF amounts', () => {
    expect(formatWif(1234567890000000000n)).toBe('1.2346');
    expect(formatWif(1000000000000000000000n)).toBe('1,000');
  });
  it('labels live and neutral market states', () => {
    expect(marketLabel('NVDA',420,0)).toBe('NVDA +4.2%');
    expect(marketLabel('NVDA',0,4)).toContain('No 24 h history: neutral');
    expect(marketLabel('NVDA',0,3)).toContain('Paused');
  });
  it('guards fork funding by mode and actual chain id', () => {
    expect(forkFundingAllowed(31337,'fork')).toBe(true);
    expect(forkFundingAllowed(4663,'fork')).toBe(false);
    expect(forkFundingAllowed(31337,'mainnet')).toBe(false);
  });
  it('earns the epic frame only from a market buff', () => {
    expect(rarityOf(0, 900)).toBe('common'); // house fighters never change frame
    expect(rarityOf(15, null)).toBe('rare');
    expect(rarityOf(15, -300)).toBe('rare');
    expect(rarityOf(15, 1)).toBe('epic');
    expect(statBpsFromMove(1000)).toBe(1500); // 2x, capped at +15%
    expect(statBpsFromMove(-123)).toBe(-246);
  });
  it('keeps troop drops in the dropping seat\'s half', () => {
    expect(dropDecision(0, 9, 5)).toEqual({ x: 9, y: 5 });
    expect(dropDecision(0, 9, 15)).toEqual({ x: 9, y: 14.5 }); // a slip over the line snaps back
    expect(dropDecision(0, 9, 25)).toBeNull(); // deep in enemy territory is refused
    expect(dropDecision(1, 9, 25)).toEqual({ x: 9, y: 25 });
    expect(dropDecision(1, 9, 5)).toBeNull();
  });
});
