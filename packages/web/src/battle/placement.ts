import { RIVER_BOT, RIVER_TOP, FP } from '@mempire/sim';
export type Point = { x: number; y: number };
export type FieldRect = { left: number; top: number; width: number; height: number };
/** The same field transform is used by mouse, touch, drag preview and tap placement. */
export function screenToField(rect: FieldRect, clientX: number, clientY: number, seat: 0 | 1): Point | null {
  if (![clientX, clientY, rect.left, rect.top, rect.width, rect.height].every(Number.isFinite) || rect.width <= 0 || rect.height <= 0) return null;
  const k = Math.min(rect.width / 18, rect.height / 32);
  const x = (clientX - rect.left - (rect.width - k * 18) / 2) / k;
  const y = (clientY - rect.top - (rect.height - k * 32) / 2) / k;
  if (x < 0 || x > 18 || y < 0 || y > 32) return null;
  return seat === 0 ? { x, y: 32 - y } : { x: 18 - x, y };
}
export function dragIntent(origin: Point, current: Point): boolean { return Math.hypot(current.x - origin.x, current.y - origin.y) >= 8; }
export function dropDecision(seat: 0 | 1, x: number, y: number): Point | null {
  if (![x, y].every(Number.isFinite)) return null;
  const h = seat === 0 ? { minY: .5, maxY: RIVER_TOP / FP - .5 } : { minY: RIVER_BOT / FP + .5, maxY: 31.5 };
  const past = Math.max(h.minY - y, y - h.maxY, .5 - x, x - 17.5);
  if (past > 1.5) return null;
  return { x: Math.max(.5, Math.min(17.5, x)), y: Math.max(h.minY, Math.min(h.maxY, y)) };
}
