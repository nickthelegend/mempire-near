import { useEffect, useRef } from 'react';
import { Archetype, FP, RIVER_BOT, RIVER_TOP, BRIDGE_X, BRIDGE_HALF_W, type SimState, type Unit } from '@mempire/sim';
import { useMatch } from '../state/battle';
import { artOf, fighter } from '../lib/fighters';
import { ART } from '../lib/art';

/**
 * The battle arena, drawn on a 2D canvas: a bright two-lane field, tower renders and full-body fighters.
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
/** Fighters are drawn larger than their hit circle so they read on a phone; the sim's ranges are unchanged. */
const UNIT_SCALE = 1.5;
const COLORS = { home: '#3d8bff', foe: '#ff4b5c', jade: '#2fcf5a', gold: '#ffb800', ink: '#2a1d5c' };

export { dropDecision } from './placement';
import { dropDecision, screenToField, type Point } from './placement';

const images = new Map<string, HTMLImageElement>();
function img(src: string) {
  let i = images.get(src);
  if (!i) { i = new Image(); i.decoding = 'async'; i.src = src; images.set(src, i); }
  return i.complete && i.naturalWidth > 0 ? i : null;
}

type Fx = { kind: 'hit' | 'blast' | 'tower' | 'spawn' | 'tracer' | 'dmg' | 'death'; x: number; y: number; x2?: number; y2?: number; t0: number; dur: number; owner: 0 | 1; text?: string; r?: number; splash?: boolean };

export function BattleBoard({ perspective, placing, spell, onPlace, label, preview, fighterId }: {
  preview?: Point | null; fighterId?: number; perspective: 0 | 1; placing: boolean; spell: boolean; onPlace: (x: number, y: number) => void; label: string;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const state = useRef<{ prev: SimState | null; curr: SimState | null; at: number; fx: Fx[]; lunge: Map<number, { tx: number; ty: number; t0: number }>; pointer: { x: number; y: number } | null }>({ prev: null, curr: null, at: 0, fx: [], lunge: new Map(), pointer: null });
  const props = useRef({ perspective, placing, spell, preview, fighterId });
  props.current = { perspective, placing, spell, preview, fighterId };

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
        if (!p) { s.fx.push({ kind: 'spawn', x: u.x / FP, y: u.y / FP, t0: now, dur: 560, owner: u.owner, r: (RADIUS[u.archetype] ?? 0.7) * 1.5 }); continue; }
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
        if (t.hp < p.hp) s.fx.push({ kind: 'hit', x:t.x/FP, y:t.y/FP, t0:now, dur:220, owner:t.owner, r:1.4 });
        if (t.hp < p.hp) s.fx.push({ kind: 'dmg', x: t.x / FP, y: t.y / FP + (t.owner === 0 ? 1.2 : -1.2), t0: now, dur: 800, owner: t.owner, text: `−${p.hp - t.hp}` });
        if (t.hp <= 0 && p.hp > 0) s.fx.push({ kind: 'tower', x: t.x / FP, y: t.y / FP, t0: now, dur: 1800, owner: t.owner, r: 4.2 });
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
    const floorCache: { key: string; canvas: HTMLCanvasElement | null } = { key: '', canvas: null };
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
      // The field is symmetric, so one cached floor serves both seats.
      const arenaArt = img(ART.arena);
      const key = `${cw}x${ch}:${arenaArt ? 'art' : 'drawn'}`;
      if (floorCache.key !== key) { floorCache.key = key; floorCache.canvas = drawFloor(cw, ch, k, ox, oy, arenaArt); }
      if (floorCache.canvas) ctx.drawImage(floorCache.canvas, 0, 0);

      // The river moves.
      const ry0 = Math.min(sy(RT), sy(RB)), ry1 = Math.max(sy(RT), sy(RB));
      if (!reduce && !arenaArt) {
        ctx.save(); ctx.beginPath(); ctx.rect(ox, ry0, k * W, ry1 - ry0); ctx.clip();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)'; ctx.lineWidth = Math.max(1.5, k * 0.08); ctx.lineCap = 'round';
        const phase = (now / 1600) % 1;
        for (let i = -2; i < 14; i++) {
          const x0 = ox + (i + phase) * k * 1.7;
          const yy = (ry0 + ry1) / 2 + Math.sin(i * 1.7) * (ry1 - ry0) * 0.22;
          ctx.beginPath(); ctx.moveTo(x0, yy); ctx.quadraticCurveTo(x0 + k * 0.35, yy - k * 0.18, x0 + k * 0.7, yy); ctx.stroke();
        }
        ctx.restore();
        drawBridges(ctx, sx, ry0, ry1, k);
      }

      // Where you may not deploy.
      if (isPlacing && !isSpell) {
        const enemyY0 = seat === 0 ? sy(H) : sy(RT);
        const enemyY1 = seat === 0 ? sy(RT) : sy(H);
        const y0 = Math.min(enemyY0, enemyY1), y1 = Math.max(enemyY0, enemyY1);
        ctx.save();
        ctx.fillStyle = 'rgba(255, 75, 92, 0.22)'; ctx.fillRect(ox, y0, k * W, y1 - y0);
        ctx.strokeStyle = 'rgba(255, 75, 92, 0.28)'; ctx.lineWidth = k * 0.14;
        ctx.beginPath(); ctx.rect(ox, y0, k * W, y1 - y0); ctx.clip();
        for (let d = -H; d < W + H; d += 1.4) { ctx.beginPath(); ctx.moveTo(ox + d * k, y0); ctx.lineTo(ox + (d + 6) * k, y1); ctx.stroke(); }
        ctx.restore();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
        const my0 = Math.min(sy(seat === 0 ? 0 : RB), sy(seat === 0 ? RT : H)), my1 = Math.max(sy(seat === 0 ? 0 : RB), sy(seat === 0 ? RT : H));
        ctx.fillRect(ox, my0, k * W, my1 - my0);
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
          const mine = sp.owner === seat;
          ctx.save();
          ctx.fillStyle = mine ? 'rgba(61, 139, 255, 0.18)' : 'rgba(255, 75, 92, 0.18)';
          ctx.beginPath(); ctx.arc(sx(sp.x / FP), sy(sp.y / FP), r, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = mine ? COLORS.home : COLORS.foe; ctx.lineWidth = k * 0.16; ctx.setLineDash([k * 0.45, k * 0.25]);
          ctx.lineDashOffset = reduce ? 0 : -now / 40;
          ctx.beginPath(); ctx.arc(sx(sp.x / FP), sy(sp.y / FP), r, 0, Math.PI * 2); ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = mine ? 'rgba(61, 139, 255, 0.3)' : 'rgba(255, 75, 92, 0.3)';
          ctx.beginPath(); ctx.moveTo(sx(sp.x / FP), sy(sp.y / FP)); ctx.arc(sx(sp.x / FP), sy(sp.y / FP), r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - left)); ctx.fill();
          ctx.restore();
        }

        // Towers and units share one depth order: far side first.
        type Drawable = { y: number; draw: () => void };
        const list: Drawable[] = [];
        for (const t of sim.towers) {
          list.push({ y: sy(t.y / FP), draw: () => { const hit = !reduce && s.fx.find(f=>f.kind==='hit' && Math.abs(f.x-t.x/FP)<.1 && Math.abs(f.y-t.y/FP)<.1 && now-f.t0<220); ctx.save(); if(hit)ctx.translate(Math.sin((now-hit.t0)/17)*k*.14,0); drawTower(ctx, t.owner === seat, t.kind === 'king', sx(t.x / FP), sy(t.y / FP) + (t.kind === 'king' ? 1.2 : 0.9) * k, k, t.hp, t.maxHp, !!arenaArt && t.kind === 'king'); ctx.restore(); } });
        }
        for (const u of sim.units) {
          const p = pos(u);
          let x = sx(p.x), y = sy(p.y);
          const lunge = s.lunge.get(u.id);
          if (lunge && !reduce) {
            const e = (now - lunge.t0) / 180;
            if (e < 1) { const a = Math.sin(e * Math.PI) * 0.32 * k; const dx = sx(lunge.tx) - x, dy = sy(lunge.ty) - y; const d = Math.hypot(dx, dy) || 1; x += (dx / d) * a; y += (dy / d) * a; }
            else s.lunge.delete(u.id);
          }
          const hop = !reduce && u.state === 'advance' ? Math.abs(Math.sin(now / 140 + u.id)) * k * 0.14 : 0;
          const fighterId = sim.players[u.owner].deck[u.cardIndex]?.fighterId ?? 0;
          list.push({ y, draw: () => drawUnit(ctx, u, x, y, hop, (RADIUS[u.archetype] ?? 0.7) * k * UNIT_SCALE, u.owner === seat, fighterId) });
        }
        list.sort((a, b) => a.y - b.y).forEach((d) => d.draw());

        // Effects.
        s.fx = s.fx.filter((f) => now - f.t0 < f.dur);
        for (const f of s.fx) {
          const e = (now - f.t0) / f.dur;
          if (e < 0) continue;
          const x = sx(f.x), y = sy(f.y);
          ctx.save();
          if (f.kind === 'dmg') {
            ctx.globalAlpha = Math.min(1, (1 - e) * 1.5);
            const pop = reduce ? 1 : 1 + Math.max(0, 0.35 - e) * 1.4;
            ctx.font = `900 ${Math.max(15, k * 0.95 * pop)}px Urbanist, sans-serif`; ctx.textAlign = 'center'; ctx.lineJoin = 'round';
            ctx.lineWidth = Math.max(3, k * 0.18); ctx.strokeStyle = COLORS.ink; ctx.fillStyle = f.owner === seat ? '#ff9aa5' : '#ffffff';
            const yy = y - k * (0.9 + (reduce ? 0 : e * 1.3));
            ctx.strokeText(f.text ?? '', x, yy); ctx.fillText(f.text ?? '', x, yy);
          } else if (f.kind === 'tracer') {
            const t = Math.min(1, e * 1.4);
            const x2 = sx(f.x2!), y2 = sy(f.y2!);
            const hx = x + (x2 - x) * t, hy = y + (y2 - y) * t - Math.sin(t * Math.PI) * k * (f.splash ? 1.2 : 0.4);
            const r = (f.splash ? 0.38 : 0.22) * k;
            ctx.fillStyle = f.splash ? (f.owner === seat ? '#7cc0ff' : '#ff8a96') : '#ffe066';
            ctx.strokeStyle = COLORS.ink; ctx.lineWidth = Math.max(1.5, k * 0.07);
            ctx.globalAlpha = 0.35; ctx.beginPath(); ctx.arc(hx - (x2 - x) * 0.04, hy - (y2 - y) * 0.04, r * 0.8, 0, Math.PI * 2); ctx.fill();
            ctx.globalAlpha = 1; ctx.beginPath(); ctx.arc(hx, hy, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
          } else if (f.kind === 'hit') {
            const size = (f.r ?? 0.9) * k * (0.55 + e * 0.75);
            ctx.globalAlpha = 1 - e;
            star(ctx, x, y, size, size * 0.45, 8, reduce ? 0 : e * 0.6);
            ctx.fillStyle = '#fff3a8'; ctx.fill(); ctx.lineWidth = Math.max(1.5, k * 0.06); ctx.strokeStyle = '#ff9f1a'; ctx.stroke();
            star(ctx, x, y, size * 0.5, size * 0.22, 8, 0); ctx.fillStyle = '#ffffff'; ctx.fill();
          } else if (f.kind === 'spawn') {
            const r = (f.r ?? 0.8) * k * (1 + e * 1.4);
            ctx.globalAlpha = 1 - e;
            ctx.strokeStyle = f.owner === seat ? COLORS.home : COLORS.foe; ctx.lineWidth = k * 0.18 * (1 - e);
            ctx.beginPath(); ctx.ellipse(x, y + k * 0.3, r, r * 0.45, 0, 0, Math.PI * 2); ctx.stroke();
            puffs(ctx, x, y + k * 0.3, r * 0.9, k * 0.28 * (1 - e * 0.5), 6, '#ffffff');
          } else if (f.kind === 'death') {
            const r = (f.r ?? 0.8) * k * (0.6 + e * 1.4);
            ctx.globalAlpha = (1 - e) * 0.95;
            puffs(ctx, x, y, r, k * (0.42 - e * 0.2), 7, '#f4f1ff');
          } else if (f.kind === 'blast' || f.kind === 'tower') {
            const R = (f.r ?? 2.5) * k;
            ctx.globalAlpha = Math.max(0, 1 - e * 1.1);
            const g = ctx.createRadialGradient(x, y, 0, x, y, R * (0.5 + e * 0.6));
            g.addColorStop(0, '#fffbe0'); g.addColorStop(0.45, '#ffd23f'); g.addColorStop(0.8, 'rgba(255, 122, 26, 0.85)'); g.addColorStop(1, 'rgba(255, 90, 31, 0)');
            ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, R * (0.5 + e * 0.6), 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = '#ffffff'; ctx.lineWidth = k * 0.2 * (1 - e);
            ctx.beginPath(); ctx.arc(x, y, R * e * 1.1, 0, Math.PI * 2); ctx.stroke();
            if (f.kind === 'tower') coins(ctx, x, y, R, e, k, reduce);
          }
          ctx.restore();
        }
      }

      // Drop preview under the pointer.
      if (isPlacing && (props.current.preview || s.pointer)) {
        const t = props.current.preview || s.pointer!;
        const d = isSpell ? { x: t.x, y: t.y } : dropDecision(seat, t.x, t.y);
        const ok = !!d;
        const px = sx(d?.x ?? t.x), py = sy(d?.y ?? t.y);
        ctx.save();
        if (ok) { const laneX = d!.x < 9 ? .5 : 9; ctx.fillStyle = 'rgba(255, 216, 77, .25)'; const top = Math.min(sy(seat===0?14.5:31.5),sy(seat===0?.5:17.5)); ctx.fillRect(sx(seat===0?laneX:laneX+8.5),top,8.5*k,14*k); }
        const ghost = props.current.fighterId === undefined ? null : img(artOf(props.current.fighterId));
        if (ghost) { ctx.globalAlpha = .72; const h = k*4.2, w=h*ghost.naturalWidth/ghost.naturalHeight; ctx.drawImage(ghost,px-w/2,py-h,w,h); ctx.globalAlpha=1; }
        ctx.fillStyle = ok ? 'rgba(255, 255, 255, 0.25)' : 'rgba(255, 75, 92, 0.25)';
        ctx.beginPath(); ctx.arc(px, py, (isSpell ? 2.5 : 0.9) * k, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = ok ? '#ffffff' : COLORS.foe; ctx.lineWidth = k * 0.12; ctx.setLineDash([k * 0.3, k * 0.2]);
        ctx.stroke();
        ctx.restore();
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  const toTiles = (x: number, y: number) => screenToField(wrap.current!.getBoundingClientRect(), x, y, props.current.perspective);

  return (
    <div ref={wrap} className="board-wrap" data-placing={placing} role="application" aria-label={label}
      onPointerMove={(e) => { state.current.pointer = toTiles(e.clientX, e.clientY); }}
      onPointerLeave={() => { state.current.pointer = null; }}
      onPointerDown={(e) => { if (!props.current.placing) return; const t = toTiles(e.clientX, e.clientY); state.current.pointer = t; if (t) onPlace(t.x, t.y); }}>
      <canvas ref={canvas} />
    </div>
  );
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, h / 2, w / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y); ctx.arcTo(x + w, y, x + w, y + h, rr); ctx.arcTo(x + w, y + h, x, y + h, rr); ctx.arcTo(x, y + h, x, y, rr); ctx.arcTo(x, y, x + w, y, rr); ctx.closePath();
}

/* ── Field, towers and fighters ────────────────────────────────────────── */

/** The bright two-lane field: checked grass, sand lanes, a blue river and two wooden bridges. Cached per size. */
/**
 * Where the sim's field sits inside mp3-arena (1024x1536 art px): lanes at x 260 / 760 (= tiles 3.5 / 14.5), the river
 * centred at y 755, king towers ~27 tiles apart. Mapping that box onto the field lines the painted lanes, river and king
 * keeps up with the sim's (a slight horizontal squeeze). The art is turned 180° so the red keep is the foe's, at the top.
 */
const ART_FIELD = { x: 103, y: 109, w: 818, h: 1292 };

function drawFloor(cw: number, ch: number, k: number, ox: number, oy: number, art: HTMLImageElement | null): HTMLCanvasElement | null {
  const c = document.createElement('canvas');
  c.width = cw; c.height = ch;
  const g = c.getContext('2d');
  if (!g) return null;
  if (art) {
    drawHedge(g, cw, ch, k, ox, oy);
    const r = art.naturalWidth / 1024;
    const scx = (k * W) / (ART_FIELD.w * r), scy = (k * H) / (ART_FIELD.h * r);
    const fx = ox + (k * W) / 2, fy = oy + (k * H) / 2;
    g.save();
    g.translate(fx, fy); g.rotate(Math.PI); g.translate(-fx, -fy);
    g.drawImage(art, ox - ART_FIELD.x * r * scx, oy - ART_FIELD.y * r * scy, art.naturalWidth * scx, art.naturalHeight * scy);
    g.restore();
    return c;
  }
  drawHedge(g, cw, ch, k, ox, oy);
  // Grass checker (screen space; the field is symmetric so seat does not matter).
  for (let ty = 0; ty < H; ty++) for (let tx = 0; tx < W; tx++) {
    g.fillStyle = (tx + ty) % 2 ? '#8fe063' : '#82d856';
    g.fillRect(ox + tx * k, oy + ty * k, Math.ceil(k), Math.ceil(k));
  }
  const X = (x: number) => ox + x * k, Y = (y: number) => oy + y * k;
  // Sand lanes from each princess tower to the river, and a plaza at each king.
  g.fillStyle = '#f3d892';
  for (const bx of BRIDGES) {
    roundRect(g, X(bx - 0.95), Y(3.6), 1.9 * k, (RT - 3.6) * k, k * 0.5); g.fill();
    roundRect(g, X(bx - 0.95), Y(RB), 1.9 * k, (H - 3.6 - RB) * k, k * 0.5); g.fill();
  }
  for (const ky of [2.5, H - 2.5]) { g.beginPath(); g.ellipse(X(9), Y(ky), 3.2 * k, 2.1 * k, 0, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = 'rgba(217, 168, 82, 0.5)';
  for (const bx of BRIDGES) for (let y = 4; y < H - 4; y += 1.3) if (y < RT - 0.4 || y > RB + 0.4) { g.beginPath(); g.arc(X(bx + Math.sin(y * 3.1) * 0.5), Y(y), k * 0.08, 0, Math.PI * 2); g.fill(); }
  // River with grassy banks.
  const ry0 = Y(RT), ry1 = Y(RB);
  const water = g.createLinearGradient(0, ry0, 0, ry1);
  water.addColorStop(0, '#62d6ff'); water.addColorStop(0.5, '#33b3f2'); water.addColorStop(1, '#62d6ff');
  g.fillStyle = water; g.fillRect(ox, ry0, k * W, ry1 - ry0);
  g.fillStyle = '#5bbf3e'; g.fillRect(ox, ry0 - k * 0.14, k * W, k * 0.14); g.fillRect(ox, ry1, k * W, k * 0.14);
  g.fillStyle = 'rgba(255, 255, 255, 0.55)'; g.fillRect(ox, ry0, k * W, Math.max(1, k * 0.06)); g.fillRect(ox, ry1 - Math.max(1, k * 0.06), k * W, Math.max(1, k * 0.06));
  drawBridges(g, (x) => ox + x * k, ry0, ry1, k);
  // Field outline.
  g.lineWidth = Math.max(3, k * 0.16); g.strokeStyle = COLORS.ink;
  roundRect(g, ox, oy, k * W, k * H, k * 0.4); g.stroke();
  return c;
}

/** Deep green surround with soft stripes and round bushes outside the field. */
function drawHedge(g: CanvasRenderingContext2D, cw: number, ch: number, k: number, ox: number, oy: number) {
  // Surround: a hedge of deep green with soft stripes.
  g.fillStyle = '#2f9a4a'; g.fillRect(0, 0, cw, ch);
  g.fillStyle = 'rgba(255, 255, 255, 0.05)';
  for (let x = -ch; x < cw; x += 28) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + ch, ch); g.lineTo(x + ch + 12, ch); g.lineTo(x + 12, 0); g.fill(); }
  // Round bushes and trees outside the field (a fixed pattern, so the cache is stable).
  const side = Math.max(ox, oy);
  if (side > k * 0.8) {
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 90; i++) {
      const x = rnd() * cw, y = rnd() * ch;
      const inField = x > ox - k * 0.6 && x < ox + k * W + k * 0.6 && y > oy - k * 0.6 && y < oy + k * H + k * 0.6;
      if (inField) continue;
      const r = k * (0.6 + rnd() * 0.9);
      g.fillStyle = 'rgba(42, 29, 92, 0.22)'; g.beginPath(); g.ellipse(x + r * 0.15, y + r * 0.75, r, r * 0.4, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = rnd() > 0.5 ? '#3fbf4f' : '#4fcf55'; g.strokeStyle = COLORS.ink; g.lineWidth = Math.max(2, k * 0.08);
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); g.stroke();
      g.fillStyle = 'rgba(255, 255, 255, 0.28)'; g.beginPath(); g.arc(x - r * 0.3, y - r * 0.35, r * 0.35, 0, Math.PI * 2); g.fill();
    }
  }
}

function drawBridges(g: CanvasRenderingContext2D, sx: (x: number) => number, ry0: number, ry1: number, k: number) {
  for (const bx of BRIDGES) {
    const x0 = Math.min(sx(bx - BRIDGE_W / 2), sx(bx + BRIDGE_W / 2)), bw = BRIDGE_W * k;
    const by0 = ry0 - k * 0.5, bh = ry1 - ry0 + k;
    g.fillStyle = 'rgba(42, 29, 92, 0.25)'; roundRect(g, x0 + k * 0.08, by0 + k * 0.16, bw, bh, k * 0.2); g.fill();
    g.fillStyle = '#d99a55'; roundRect(g, x0, by0, bw, bh, k * 0.2); g.fill();
    g.fillStyle = '#b8743a';
    for (let p = by0 + k * 0.32; p < by0 + bh - k * 0.1; p += k * 0.42) g.fillRect(x0 + k * 0.1, p, bw - k * 0.2, Math.max(1, k * 0.07));
    g.lineWidth = Math.max(2, k * 0.1); g.strokeStyle = COLORS.ink; roundRect(g, x0, by0, bw, bh, k * 0.2); g.stroke();
  }
}

function drawTower(g: CanvasRenderingContext2D, mine: boolean, king: boolean, cx: number, base: number, k: number, hp: number, maxHp: number, baked = false) {
  const sprite = baked ? null : img(mine ? ART.towerHome : ART.towerFoe);
  const tw = (king ? 3.9 : 3.0) * k;
  const th = baked ? 3.6 * k : sprite ? tw * (sprite.naturalHeight / sprite.naturalWidth) : tw * 1.15;
  if (baked) {
    // The king's keep is painted into the arena art; mark its fall with rubble and smoke.
    if (hp <= 0) {
      g.save();
      g.fillStyle = 'rgba(70, 60, 90, 0.55)'; g.beginPath(); g.ellipse(cx, base - th * 0.45, tw * 0.55, th * 0.5, 0, 0, Math.PI * 2); g.fill();
      puffs(g, cx, base - th * 0.55, tw * 0.3, k * 0.5, 7, '#d9d4e8');
      g.restore();
    }
  }
  g.save();
  g.fillStyle = 'rgba(42, 29, 92, 0.28)';
  g.beginPath(); g.ellipse(cx, base - k * 0.1, tw * 0.48, tw * 0.17, 0, 0, Math.PI * 2); g.fill();
  if (hp <= 0) { g.globalAlpha = 0.5; g.filter = 'grayscale(1) brightness(0.9)'; }
  if (baked) { /* painted into the floor */ }
  else if (sprite) g.drawImage(sprite, cx - tw / 2, base - th, tw, th);
  else {
    // A chunky drawn keep until the render lands.
    const bw = tw * 0.78, bh = th * 0.72, x = cx - bw / 2, y = base - bh;
    g.fillStyle = mine ? '#4d93ff' : '#ff5d6c'; g.strokeStyle = COLORS.ink; g.lineWidth = Math.max(2, k * 0.12);
    roundRect(g, x, y, bw, bh, k * 0.3); g.fill(); g.stroke();
    const mw = bw / 5;
    for (let i = 0; i < 5; i += 2) { roundRect(g, x + i * mw, y - mw * 0.8, mw, mw, k * 0.12); g.fill(); g.stroke(); }
    g.fillStyle = 'rgba(255, 255, 255, 0.3)'; roundRect(g, x + k * 0.2, y + k * 0.2, bw * 0.18, bh - k * 0.6, k * 0.1); g.fill();
    g.fillStyle = '#6b3d1f'; roundRect(g, cx - bw * 0.14, base - bh * 0.42, bw * 0.28, bh * 0.42, bw * 0.14); g.fill();
    if (king) { g.fillStyle = COLORS.gold; star(g, cx, y - mw * 1.6, mw * 0.8, mw * 0.4, 5, 0); g.fill(); g.lineWidth = Math.max(1.5, k * 0.07); g.stroke(); }
  }
  g.restore();
  if (hp > 0) {
    const bw = (king ? 4.0 : 3.4) * k, bh = Math.max(12, k * 0.65);
    const bx = cx - bw / 2, by = Math.max(8, base - th - bh - k * 0.15);
    g.fillStyle = COLORS.ink; roundRect(g, bx - 2, by - 2, bw + 4, bh + 4, (bh + 4) / 2); g.fill();
    g.fillStyle = 'rgba(255, 255, 255, 0.18)'; roundRect(g, bx, by, bw, bh, bh / 2); g.fill();
    g.fillStyle = mine ? COLORS.home : COLORS.foe; roundRect(g, bx, by, Math.max(bh, bw * (hp / maxHp)), bh, bh / 2); g.fill();
    g.fillStyle = 'rgba(255, 255, 255, 0.35)'; roundRect(g, bx + 2, by + 1, Math.max(0, bw * (hp / maxHp) - 4), bh * 0.35, bh / 4); g.fill();
    g.font = `900 ${Math.max(13, k * 0.64)}px Urbanist, sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    g.lineWidth = Math.max(2, k * 0.12); g.strokeStyle = COLORS.ink; g.fillStyle = '#fff';
    g.strokeText(String(hp), cx, by + bh / 2 + 1); g.fillText(String(hp), cx, by + bh / 2 + 1);
  }
}

function drawUnit(g: CanvasRenderingContext2D, u: Unit, x: number, y: number, hop: number, r: number, mine: boolean, fighterId: number) {
  const team = mine ? COLORS.home : COLORS.foe;
  const feet = y + r * 0.55;
  // shadow and team base
  g.fillStyle = 'rgba(42, 29, 92, 0.3)';
  g.beginPath(); g.ellipse(x, feet, r * 0.95, r * 0.36, 0, 0, Math.PI * 2); g.fill();
  g.lineWidth = Math.max(2, r * 0.2); g.strokeStyle = team;
  g.beginPath(); g.ellipse(x, feet, r * 0.85, r * 0.32, 0, 0, Math.PI * 2); g.stroke();
  const art = img(artOf(fighterId));
  const h = r * 2.6;
  let top = feet - h - hop;
  if (art) {
    const w = h * (art.naturalWidth / art.naturalHeight);
    g.save();
    if (!mine) { g.translate(x, 0); g.scale(-1, 1); g.translate(-x, 0); }
    g.drawImage(art, x - w / 2, top, w, h);
    g.restore();
  } else {
    const rr = r * 1.05, cy = feet - rr - hop;
    top = cy - rr;
    g.fillStyle = team; g.strokeStyle = COLORS.ink; g.lineWidth = Math.max(2, r * 0.16);
    g.beginPath(); g.arc(x, cy, rr, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = 'rgba(255, 255, 255, 0.35)'; g.beginPath(); g.arc(x - rr * 0.3, cy - rr * 0.35, rr * 0.3, 0, Math.PI * 2); g.fill();
    g.font = `900 ${Math.max(9, rr * 0.8)}px Urbanist, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff';
    g.fillText(fighter(fighterId).ticker.slice(0, 1), x, cy + 1);
  }
  // HP once hurt
  if (u.hp < u.maxHp) {
    const bw = Math.max(18, r * 1.9), bh = Math.max(4, r * 0.24), bx = x - bw / 2, by = top - bh - 3;
    g.fillStyle = COLORS.ink; roundRect(g, bx - 1.5, by - 1.5, bw + 3, bh + 3, bh); g.fill();
    g.fillStyle = mine ? COLORS.home : COLORS.foe; roundRect(g, bx, by, Math.max(bh, bw * (u.hp / u.maxHp)), bh, bh / 2); g.fill();
  }
  // the market's mark on this fighter
  if (u.metaBps !== 0) {
    const bx = x + r * 0.95, by = top + r * 0.5, br = Math.max(6, r * 0.36);
    g.fillStyle = u.metaBps > 0 ? COLORS.jade : COLORS.foe; g.strokeStyle = COLORS.ink; g.lineWidth = Math.max(1.5, br * 0.24);
    g.beginPath(); g.arc(bx, by, br, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = '#fff';
    g.beginPath();
    if (u.metaBps > 0) { g.moveTo(bx, by - br * 0.5); g.lineTo(bx + br * 0.5, by + br * 0.35); g.lineTo(bx - br * 0.5, by + br * 0.35); }
    else { g.moveTo(bx, by + br * 0.5); g.lineTo(bx + br * 0.5, by - br * 0.35); g.lineTo(bx - br * 0.5, by - br * 0.35); }
    g.fill();
  }
}

/* ── Effects ───────────────────────────────────────────────────────────── */
function star(g: CanvasRenderingContext2D, x: number, y: number, R: number, r: number, n: number, rot: number) {
  g.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const a = rot + (i * Math.PI) / n - Math.PI / 2, rr = i % 2 ? r : R;
    if (i === 0) g.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); else g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
}
function puffs(g: CanvasRenderingContext2D, x: number, y: number, R: number, r: number, n: number, color: string) {
  g.fillStyle = color; g.strokeStyle = 'rgba(42, 29, 92, 0.35)'; g.lineWidth = Math.max(1, r * 0.18);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + 0.4;
    g.beginPath(); g.arc(x + Math.cos(a) * R, y + Math.sin(a) * R * 0.6, Math.max(1, r), 0, Math.PI * 2); g.fill(); g.stroke();
  }
}
/** Gold coins burst from a fallen tower. */
function coins(g: CanvasRenderingContext2D, x: number, y: number, R: number, e: number, k: number, reduce: boolean) {
  if (reduce) return;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + (i % 3) * 0.2;
    const d = R * (0.3 + e * (0.9 + (i % 4) * 0.15));
    const cx = x + Math.cos(a) * d, cy = y + Math.sin(a) * d * 0.7 - R * 0.6 * Math.sin(e * Math.PI) + e * e * R * 0.5;
    const cr = k * 0.32;
    g.globalAlpha = Math.max(0, 1 - e);
    g.fillStyle = COLORS.gold; g.strokeStyle = COLORS.ink; g.lineWidth = Math.max(1.5, k * 0.07);
    g.beginPath(); g.ellipse(cx, cy, cr * Math.abs(Math.cos(e * 9 + i)) + cr * 0.25, cr, 0, 0, Math.PI * 2); g.fill(); g.stroke();
  }
}
