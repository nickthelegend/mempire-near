import { useEffect, useRef } from 'react';
import { Archetype, FP, RIVER_BOT, RIVER_TOP, BRIDGE_X, BRIDGE_HALF_W, type SimState, type Unit } from '@mempire/sim';
import { useMatch } from '../state/battle';
import { artSmallOf } from '../lib/fighters';

/**
 * The battle arena, drawn on a 2D canvas over the painted floor.
 *
 * It only draws the deterministic sim's state (positions, hit points, pending spells); nothing here
 * feeds back into the match. Positions are interpolated between the 20 Hz sim steps, and hits, deaths,
 * spell blasts and fallen towers are spotted by diffing consecutive states, so the effects are always
 * what the sim actually did.
 */
const W = 18;
const H = 32;
const RT = RIVER_TOP / FP;
const RB = RIVER_BOT / FP;
const BRIDGES = BRIDGE_X.map((x) => x / FP);
const BRIDGE_W = (BRIDGE_HALF_W / FP) * 2;
const RADIUS: Record<number, number> = { [Archetype.Tank]: 1.3, [Archetype.Swarm]: 0.72, [Archetype.Ranged]: 0.95, [Archetype.Splash]: 1.05, [Archetype.Support]: 0.95 };
const COLORS = { home: '#e8b64c', foe: '#ff4d6d', jade: '#2fd39a', ivory: '#f7e2a8' };

/** The deploying player's own half, in tiles. */
function ownHalf(seat: 0 | 1) {
  return seat === 0 ? { minX: 0.5, maxX: W - 0.5, minY: 0.5, maxY: RT - 0.5 } : { minX: 0.5, maxX: W - 0.5, minY: RB + 0.5, maxY: H - 0.5 };
}
const FORGIVEN_TILES = 1.5;
/** A troop drop near the line snaps into your half; one deep in enemy territory is refused. */
export function dropDecision(seat: 0 | 1, x: number, y: number): { x: number; y: number } | null {
  const h = ownHalf(seat);
  const past = Math.max(h.minY - y, y - h.maxY, h.minX - x, x - h.maxX);
  if (past <= 0) return { x, y };
  if (past > FORGIVEN_TILES) return null;
  return { x: Math.min(Math.max(x, h.minX), h.maxX), y: Math.min(Math.max(y, h.minY), h.maxY) };
}

const images = new Map<string, HTMLImageElement>();
function img(src: string) {
  let i = images.get(src);
  if (!i) { i = new Image(); i.decoding = 'async'; i.src = src; images.set(src, i); }
  return i.complete && i.naturalWidth > 0 ? i : null;
}

type Fx = { kind: 'hit' | 'blast' | 'tower' | 'spawn' | 'tracer' | 'dmg' | 'death'; x: number; y: number; x2?: number; y2?: number; t0: number; dur: number; owner: 0 | 1; text?: string; r?: number; splash?: boolean };

export function BattleBoard({ perspective, placing, spell, onPlace, label }: {
  perspective: 0 | 1; placing: boolean; spell: boolean; onPlace: (x: number, y: number) => void; label: string;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const state = useRef<{ prev: SimState | null; curr: SimState | null; at: number; fx: Fx[]; lunge: Map<number, { tx: number; ty: number; t0: number }>; pointer: { x: number; y: number } | null }>({ prev: null, curr: null, at: 0, fx: [], lunge: new Map(), pointer: null });
  const props = useRef({ perspective, placing, spell });
  props.current = { perspective, placing, spell };

  // Follow the sim and turn state changes into effects.
  useEffect(() => {
    const ingest = (sim: SimState | null) => {
      const s = state.current;
      if (!sim || sim === s.curr) return;
      const prev = s.curr;
      s.prev = prev && prev.tick < sim.tick ? prev : null;
      s.curr = sim;
      s.at = performance.now();
      if (!s.prev) return;
      const now = s.at;
      const before = new Map(s.prev.units.map((u) => [u.id, u]));
      const after = new Map(sim.units.map((u) => [u.id, u]));
      for (const u of sim.units) {
        const p = before.get(u.id);
        if (!p) { s.fx.push({ kind: 'spawn', x: u.x / FP, y: u.y / FP, t0: now, dur: 420, owner: u.owner, r: RADIUS[u.archetype] ?? 0.7 }); continue; }
        if (u.hp < p.hp) s.fx.push({ kind: 'dmg', x: u.x / FP, y: u.y / FP, t0: now, dur: 800, owner: u.owner, text: `−${p.hp - u.hp}` });
        // An attacker's cooldown resets right after it strikes.
        if (u.cooldown > p.cooldown && u.state === 'attack') {
          const target = u.targetUnit >= 0 ? after.get(u.targetUnit) ?? before.get(u.targetUnit) : null;
          const tower = u.targetTower >= 0 ? sim.towers[u.targetTower] : null;
          const tx = target ? target.x / FP : tower ? tower.x / FP : null;
          const ty = target ? target.y / FP : tower ? tower.y / FP : null;
          if (tx !== null && ty !== null) {
            if (u.archetype === Archetype.Ranged || u.archetype === Archetype.Splash) s.fx.push({ kind: 'tracer', x: u.x / FP, y: u.y / FP, x2: tx, y2: ty, t0: now, dur: 260, owner: u.owner, splash: u.archetype === Archetype.Splash });
            else s.lunge.set(u.id, { tx, ty, t0: now });
            s.fx.push({ kind: 'hit', x: tx, y: ty, t0: now + (u.archetype === Archetype.Ranged || u.archetype === Archetype.Splash ? 200 : 60), dur: 300, owner: u.owner, r: u.archetype === Archetype.Splash ? 1.6 : 0.9 });
          }
        }
      }
      for (const p of s.prev.units) if (!after.has(p.id)) s.fx.push({ kind: 'death', x: p.x / FP, y: p.y / FP, t0: now, dur: 520, owner: p.owner, r: RADIUS[p.archetype] ?? 0.7 });
      sim.towers.forEach((t, i) => {
        const p = s.prev!.towers[i];
        if (!p) return;
        if (t.hp < p.hp) s.fx.push({ kind: 'dmg', x: t.x / FP, y: t.y / FP + (t.owner === 0 ? 1.2 : -1.2), t0: now, dur: 800, owner: t.owner, text: `−${p.hp - t.hp}` });
        if (t.hp <= 0 && p.hp > 0) s.fx.push({ kind: 'tower', x: t.x / FP, y: t.y / FP, t0: now, dur: 1400, owner: t.owner, r: 3 });
      });
      const spellsNow = new Set(sim.spells.map((sp) => `${sp.owner}:${sp.explodeTick}:${sp.x}:${sp.y}`));
      for (const sp of s.prev.spells) if (!spellsNow.has(`${sp.owner}:${sp.explodeTick}:${sp.x}:${sp.y}`)) s.fx.push({ kind: 'blast', x: sp.x / FP, y: sp.y / FP, t0: now, dur: 800, owner: sp.owner, r: 2.5 });
      if (s.fx.length > 160) s.fx.splice(0, s.fx.length - 160);
    };
    ingest(useMatch.getState().sim);
    return useMatch.subscribe((st) => ingest(st.sim));
  }, []);

  // Size the canvas to its box at device resolution.
  useEffect(() => {
    const el = wrap.current, cv = canvas.current;
    if (!el || !cv) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Draw loop.
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const cv = canvas.current;
      const ctx = cv?.getContext('2d');
      if (!cv || !ctx || cv.width === 0) return;
      const { perspective: seat, placing: isPlacing, spell: isSpell } = props.current;
      const s = state.current;
      const now = performance.now();
      const cw = cv.width, ch = cv.height;
      const k = Math.min(cw / W, ch / H);
      const ox = (cw - k * W) / 2, oy = (ch - k * H) / 2;
      const sx = (x: number) => ox + (seat === 0 ? x : W - x) * k;
      const sy = (y: number) => oy + (seat === 0 ? H - y : y) * k;

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, cw, ch);
      // Floor: the painted arena, pushed back so the fighters read.
      const floor = img('/brand/v2/arena-portrait.webp');
      // The painted floor is screen-fixed: its green half is always the home side at the bottom.
      if (floor) {
        // Cover the whole canvas so a letterboxed board has painted edges, not bars.
        const r = Math.max(cw / floor.naturalWidth, ch / floor.naturalHeight);
        const fw = floor.naturalWidth * r, fh = floor.naturalHeight * r;
        ctx.drawImage(floor, (cw - fw) / 2, (ch - fh) / 2, fw, fh);
      } else { ctx.fillStyle = '#0a2326'; ctx.fillRect(0, 0, cw, ch); }
      ctx.fillStyle = 'rgba(3, 12, 13, 0.32)';
      ctx.fillRect(0, 0, cw, ch);
      if (ox > 0) {
        ctx.fillStyle = 'rgba(3, 12, 13, 0.5)';
        ctx.fillRect(0, 0, ox, ch); ctx.fillRect(ox + k * W, 0, ox + 1, ch);
        ctx.fillStyle = 'rgba(255, 227, 154, 0.35)';
        ctx.fillRect(ox - 1, 0, 1, ch); ctx.fillRect(ox + k * W, 0, 1, ch);
      }

      // Lane guides.
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 227, 154, 0.12)'; ctx.lineWidth = Math.max(1, k * 0.06); ctx.setLineDash([k * 0.4, k * 0.5]);
      for (const bx of BRIDGES) { ctx.beginPath(); ctx.moveTo(sx(bx), sy(1)); ctx.lineTo(sx(bx), sy(H - 1)); ctx.stroke(); }
      ctx.restore();

      // The channel.
      const ry0 = Math.min(sy(RT), sy(RB)), ry1 = Math.max(sy(RT), sy(RB));
      const water = ctx.createLinearGradient(0, ry0, 0, ry1);
      water.addColorStop(0, '#0c4a43'); water.addColorStop(0.5, '#147a68'); water.addColorStop(1, '#0c4a43');
      ctx.fillStyle = water; ctx.fillRect(ox, ry0, k * W, ry1 - ry0);
      if (!reduce) {
        ctx.save(); ctx.beginPath(); ctx.rect(ox, ry0, k * W, ry1 - ry0); ctx.clip();
        ctx.strokeStyle = 'rgba(159, 255, 224, 0.18)'; ctx.lineWidth = Math.max(1, k * 0.05);
        const phase = (now / 1400) % 1;
        for (let i = -2; i < 14; i++) {
          const x0 = ox + (i + phase) * k * 1.6;
          ctx.beginPath(); ctx.moveTo(x0, ry0); ctx.quadraticCurveTo(x0 + k * 0.5, (ry0 + ry1) / 2, x0, ry1); ctx.stroke();
        }
        ctx.restore();
      }
      ctx.fillStyle = 'rgba(255, 227, 154, 0.55)';
      ctx.fillRect(ox, ry0 - k * 0.05, k * W, k * 0.1); ctx.fillRect(ox, ry1 - k * 0.05, k * W, k * 0.1);
      // Bridges.
      for (const bx of BRIDGES) {
        const x0 = Math.min(sx(bx - BRIDGE_W / 2), sx(bx + BRIDGE_W / 2)), bw = BRIDGE_W * k;
        const by0 = ry0 - k * 0.45, bh = ry1 - ry0 + k * 0.9;
        ctx.fillStyle = '#3a2810'; ctx.fillRect(x0, by0, bw, bh);
        ctx.fillStyle = 'rgba(232, 182, 76, 0.35)';
        for (let p = by0 + k * 0.3; p < by0 + bh; p += k * 0.42) ctx.fillRect(x0, p, bw, Math.max(1, k * 0.05));
        ctx.fillStyle = '#e8b64c'; ctx.fillRect(x0 - k * 0.08, by0, k * 0.12, bh); ctx.fillRect(x0 + bw - k * 0.04, by0, k * 0.12, bh);
      }

      // Where you may deploy.
      if (isPlacing && !isSpell) {
        const enemyY0 = seat === 0 ? sy(H) : sy(RT);
        const enemyY1 = seat === 0 ? sy(RT) : sy(H);
        const y0 = Math.min(enemyY0, enemyY1) , y1 = Math.max(enemyY0, enemyY1);
        ctx.save();
        ctx.fillStyle = 'rgba(255, 77, 109, 0.16)'; ctx.fillRect(ox, y0, k * W, y1 - y0);
        ctx.strokeStyle = 'rgba(255, 77, 109, 0.22)'; ctx.lineWidth = k * 0.08;
        ctx.beginPath(); ctx.rect(ox, y0, k * W, y1 - y0); ctx.clip();
        for (let d = -H; d < W + H; d += 1.2) { ctx.beginPath(); ctx.moveTo(ox + d * k, y0); ctx.lineTo(ox + (d + 6) * k, y1); ctx.stroke(); }
        ctx.restore();
      }

      const sim = s.curr;
      if (sim) {
        const alpha = Math.min(1, (now - s.at) / 50);
        const prevUnits = new Map((s.prev?.units ?? []).map((u) => [u.id, u]));
        const pos = (u: Unit) => {
          const p = prevUnits.get(u.id);
          const x = p ? p.x + (u.x - p.x) * alpha : u.x, y = p ? p.y + (u.y - p.y) * alpha : u.y;
          return { x: x / FP, y: y / FP };
        };

        // Spells about to land.
        for (const sp of sim.spells) {
          const left = Math.max(0, (sp.explodeTick - sim.tick) / 20);
          const r = 2.5 * k;
          ctx.save();
          ctx.strokeStyle = sp.owner === seat ? COLORS.home : COLORS.foe; ctx.lineWidth = k * 0.12; ctx.setLineDash([k * 0.4, k * 0.25]);
          ctx.lineDashOffset = reduce ? 0 : -now / 40;
          ctx.beginPath(); ctx.arc(sx(sp.x / FP), sy(sp.y / FP), r, 0, Math.PI * 2); ctx.stroke();
          ctx.fillStyle = sp.owner === seat ? 'rgba(232, 182, 76, 0.16)' : 'rgba(255, 77, 109, 0.16)';
          ctx.beginPath(); ctx.moveTo(sx(sp.x / FP), sy(sp.y / FP)); ctx.arc(sx(sp.x / FP), sy(sp.y / FP), r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - left)); ctx.fill();
          ctx.restore();
        }

        // Towers, drawn far side first.
        const towers = sim.towers.map((t, i) => ({ t, i })).sort((a, b) => sy(a.t.y / FP) - sy(b.t.y / FP));
        for (const { t } of towers) {
          const mine = t.owner === seat;
          const sprite = img(mine ? '/brand/v2/tower-home.webp' : '/brand/v2/tower-foe.webp');
          const tw = (t.kind === 'king' ? 3.8 : 2.9) * k;
          const th = sprite ? tw * (sprite.naturalHeight / sprite.naturalWidth) : tw * 1.35;
          const cx = sx(t.x / FP), base = sy(t.y / FP) + (t.kind === 'king' ? 1.2 : 0.9) * k;
          ctx.save();
          ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
          ctx.beginPath(); ctx.ellipse(cx, base - k * 0.15, tw * 0.46, tw * 0.16, 0, 0, Math.PI * 2); ctx.fill();
          if (t.hp <= 0) { ctx.globalAlpha = 0.32; ctx.filter = 'grayscale(1) brightness(0.6)'; }
          if (sprite) ctx.drawImage(sprite, cx - tw / 2, base - th, tw, th);
          ctx.restore();
          if (t.hp > 0) {
            const bw = (t.kind === 'king' ? 3.2 : 2.5) * k, bh = Math.max(5, k * 0.34);
            const bx = cx - bw / 2, by = base - th - bh - k * 0.15;
            ctx.fillStyle = 'rgba(3, 12, 13, 0.85)'; roundRect(ctx, bx - 2, by - 2, bw + 4, bh + 4, bh);
            ctx.fill();
            ctx.fillStyle = mine ? COLORS.jade : COLORS.foe; roundRect(ctx, bx, by, bw * (t.hp / t.maxHp), bh, bh / 2); ctx.fill();
            ctx.font = `800 ${Math.max(9, k * 0.42)}px 'Big Shoulders Display', sans-serif`;
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff';
            ctx.fillText(String(t.hp), cx, by + bh / 2 + 1);
          }
        }

        // Units: painted medallions, nearest last.
        const units = [...sim.units].sort((a, b) => sy(a.y / FP) - sy(b.y / FP));
        for (const u of units) {
          const p = pos(u);
          let x = sx(p.x), y = sy(p.y);
          const lunge = s.lunge.get(u.id);
          if (lunge && !reduce) {
            const e = (now - lunge.t0) / 180;
            if (e < 1) { const a = Math.sin(e * Math.PI) * 0.28 * k; const dx = sx(lunge.tx) - x, dy = sy(lunge.ty) - y; const d = Math.hypot(dx, dy) || 1; x += (dx / d) * a; y += (dy / d) * a; }
            else s.lunge.delete(u.id);
          }
          if (!reduce && u.state === 'advance') y += Math.sin(now / 130 + u.id) * k * 0.05;
          const r = (RADIUS[u.archetype] ?? 0.7) * k;
          const mine = u.owner === seat;
          const fighterId = sim.players[u.owner].deck[u.cardIndex]?.fighterId ?? 0;
          // shadow and a team-coloured floor glow, so a unit reads at a glance
          ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
          ctx.beginPath(); ctx.ellipse(x, y + r * 0.9, r * 0.95, r * 0.34, 0, 0, Math.PI * 2); ctx.fill();
          const glow = ctx.createRadialGradient(x, y, r * 0.6, x, y, r * 1.7);
          glow.addColorStop(0, mine ? 'rgba(232, 182, 76, 0.38)' : 'rgba(255, 77, 109, 0.38)'); glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
          ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(x, y, r * 1.7, 0, Math.PI * 2); ctx.fill();
          // portrait
          const art = img(artSmallOf(fighterId));
          ctx.save();
          ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.clip();
          ctx.fillStyle = mine ? '#123a3c' : '#3a1220'; ctx.fillRect(x - r, y - r, r * 2, r * 2);
          if (art) { const sw = art.naturalWidth * 0.7, sh = sw; ctx.drawImage(art, art.naturalWidth * 0.15, art.naturalHeight * 0.06, sw, sh, x - r, y - r, r * 2, r * 2); }
          ctx.restore();
          // ring and HP arc
          ctx.lineWidth = Math.max(3, r * 0.26); ctx.strokeStyle = 'rgba(3, 12, 13, 0.85)';
          ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
          ctx.lineWidth = Math.max(2, r * 0.15);
          ctx.strokeStyle = mine ? COLORS.home : COLORS.foe;
          ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
          if (u.hp < u.maxHp) {
            ctx.strokeStyle = 'rgba(3, 12, 13, 0.9)'; ctx.lineWidth = Math.max(2, r * 0.2);
            ctx.beginPath(); ctx.arc(x, y, r + r * 0.24, 0, Math.PI * 2); ctx.stroke();
            ctx.strokeStyle = mine ? COLORS.jade : COLORS.foe;
            ctx.beginPath(); ctx.arc(x, y, r + r * 0.24, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (u.hp / u.maxHp)); ctx.stroke();
          }
          // the market's mark on this fighter
          if (u.metaBps !== 0) {
            const bx = x + r * 0.72, by = y - r * 0.72, br = Math.max(5, r * 0.36);
            ctx.fillStyle = u.metaBps > 0 ? '#0b3b2c' : '#3c0a16';
            ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = u.metaBps > 0 ? COLORS.jade : COLORS.foe; ctx.lineWidth = Math.max(1.5, br * 0.22); ctx.stroke();
            ctx.fillStyle = u.metaBps > 0 ? COLORS.jade : COLORS.foe;
            ctx.beginPath();
            if (u.metaBps > 0) { ctx.moveTo(bx, by - br * 0.5); ctx.lineTo(bx + br * 0.5, by + br * 0.35); ctx.lineTo(bx - br * 0.5, by + br * 0.35); }
            else { ctx.moveTo(bx, by + br * 0.5); ctx.lineTo(bx + br * 0.5, by - br * 0.35); ctx.lineTo(bx - br * 0.5, by - br * 0.35); }
            ctx.fill();
          }
        }

        // Effects.
        const hit = img('/brand/v2/fx-hit.webp'), burn = img('/brand/v2/fx-burn.webp'), coins = img('/brand/v2/fx-coins.webp');
        s.fx = s.fx.filter((f) => now - f.t0 < f.dur);
        for (const f of s.fx) {
          const e = (now - f.t0) / f.dur;
          if (e < 0) continue;
          const x = sx(f.x), y = sy(f.y);
          ctx.save();
          if (f.kind === 'dmg') {
            ctx.globalAlpha = 1 - e;
            ctx.font = `900 ${Math.max(11, k * 0.62)}px 'Big Shoulders Display', sans-serif`; ctx.textAlign = 'center';
            ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(3, 12, 13, 0.9)'; ctx.fillStyle = f.owner === seat ? '#ffb3c1' : COLORS.ivory;
            const yy = y - k * (0.8 + e * 1.2);
            ctx.strokeText(f.text ?? '', x, yy); ctx.fillText(f.text ?? '', x, yy);
          } else if (f.kind === 'tracer') {
            const t = Math.min(1, e * 1.4);
            const x2 = sx(f.x2!), y2 = sy(f.y2!);
            const hx = x + (x2 - x) * t, hy = y + (y2 - y) * t;
            ctx.globalCompositeOperation = 'lighter';
            const g = ctx.createLinearGradient(x, y, hx, hy);
            const c = f.splash ? (f.owner === seat ? '47, 211, 154' : '255, 77, 109') : '255, 227, 154';
            g.addColorStop(0, `rgba(${c}, 0)`); g.addColorStop(1, `rgba(${c}, 0.95)`);
            ctx.strokeStyle = g; ctx.lineWidth = f.splash ? k * 0.28 : k * 0.12; ctx.lineCap = 'round';
            ctx.beginPath(); ctx.moveTo(x + (x2 - x) * Math.max(0, t - 0.35), y + (y2 - y) * Math.max(0, t - 0.35)); ctx.lineTo(hx, hy); ctx.stroke();
          } else if (f.kind === 'hit' || f.kind === 'death' || f.kind === 'spawn') {
            const size = (f.r ?? 0.8) * k * (f.kind === 'spawn' ? 2.6 : 2.2) * (0.6 + e * 0.6);
            ctx.globalAlpha = 1 - e; ctx.globalCompositeOperation = 'lighter';
            if (f.kind === 'spawn') {
              ctx.strokeStyle = f.owner === seat ? COLORS.home : COLORS.foe; ctx.lineWidth = k * 0.14 * (1 - e);
              ctx.beginPath(); ctx.arc(x, y, size * 0.5, 0, Math.PI * 2); ctx.stroke();
            } else if (hit) ctx.drawImage(hit, x - size / 2, y - size / 2, size, size);
          } else if (f.kind === 'blast' || f.kind === 'tower') {
            const size = (f.r ?? 2.5) * k * 2.2 * (0.7 + e * 0.5);
            ctx.globalAlpha = Math.min(1, (1 - e) * 1.6);
            if (burn) ctx.drawImage(burn, x - size / 2, y - size * 0.8, size, size);
            if (f.kind === 'tower' && coins) { const cs = size * (0.8 + e * 0.6); ctx.globalAlpha = 1 - e; ctx.drawImage(coins, x - cs / 2, y - cs / 2, cs, cs); }
            ctx.globalCompositeOperation = 'lighter';
            ctx.strokeStyle = `rgba(255, 176, 103, ${1 - e})`; ctx.lineWidth = k * 0.2;
            ctx.beginPath(); ctx.arc(x, y, (f.r ?? 2.5) * k * e, 0, Math.PI * 2); ctx.stroke();
          }
          ctx.restore();
        }
      }

      // Drop preview under the pointer.
      if (isPlacing && s.pointer) {
        const t = s.pointer;
        const d = isSpell ? { x: t.x, y: t.y } : dropDecision(seat, t.x, t.y);
        const ok = !!d;
        const px = sx(d?.x ?? t.x), py = sy(d?.y ?? t.y);
        ctx.save();
        ctx.strokeStyle = ok ? COLORS.ivory : COLORS.foe; ctx.lineWidth = k * 0.1; ctx.setLineDash([k * 0.3, k * 0.2]);
        ctx.beginPath(); ctx.arc(px, py, (isSpell ? 2.5 : 0.9) * k, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  const toTiles = (clientX: number, clientY: number) => {
    const el = wrap.current!;
    const r = el.getBoundingClientRect();
    const k = Math.min(r.width / W, r.height / H);
    const ox = (r.width - k * W) / 2, oy = (r.height - k * H) / 2;
    const vx = (clientX - r.left - ox) / k, vy = (clientY - r.top - oy) / k;
    const seat = props.current.perspective;
    return { x: seat === 0 ? vx : W - vx, y: seat === 0 ? H - vy : vy };
  };

  return (
    <div ref={wrap} className="board-wrap" data-placing={placing} role="application" aria-label={label}
      onPointerMove={(e) => { state.current.pointer = toTiles(e.clientX, e.clientY); }}
      onPointerLeave={() => { state.current.pointer = null; }}
      onPointerDown={(e) => { if (!props.current.placing) return; const t = toTiles(e.clientX, e.clientY); state.current.pointer = t; onPlace(t.x, t.y); }}>
      <canvas ref={canvas} />
    </div>
  );
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, h / 2, w / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y); ctx.arcTo(x + w, y, x + w, y + h, rr); ctx.arcTo(x + w, y + h, x, y + h, rr); ctx.arcTo(x, y + h, x, y, rr); ctx.arcTo(x, y, x + w, y, rr); ctx.closePath();
}
