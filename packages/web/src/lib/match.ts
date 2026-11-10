// SPDX-License-Identifier: MIT
import type { SimState } from '@mempire/sim';

/** Crowns a side has taken: one per enemy side tower down, all three if the enemy king keep fell. */
export function crownsTaken(sim: SimState, by: 0 | 1): number {
  const enemy = sim.towers.filter((t) => t.owner !== by);
  const king = enemy.find((t) => t.kind === 'king');
  if (king && king.hp <= 0) return 3;
  return enemy.filter((t) => t.kind === 'princess' && t.hp <= 0).length;
}

/** Hit points left on a side's three towers, as a share of their total. */
export function towerHealth(sim: SimState, owner: 0 | 1): number {
  const own = sim.towers.filter((t) => t.owner === owner);
  const max = own.reduce((a, t) => a + t.maxHp, 0);
  return max ? own.reduce((a, t) => a + Math.max(0, t.hp), 0) / max : 0;
}

/** Ticks to a m:ss clock (20 ticks a second). */
export const tickClock = (tick: number) => { const s = Math.floor(tick / 20); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
