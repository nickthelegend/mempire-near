import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { dragIntent, screenToField, type Point } from './placement';
/** Pointer capture owns one gesture; cancel/escape/outside never deploy. Tap remains a native button click. */
export function useCardDrag(seat: 0 | 1, enabled: boolean, select: (slot: number) => void, place: (x: number, y: number, slot: number) => void) {
  const [preview, setPreview] = useState<Point | null>(null);
  const [dragging, setDragging] = useState(false);
  const [client, setClient] = useState<Point | null>(null);
  const gesture = useRef<{ id: number; slot: number; origin: Point; dragged: boolean } | null>(null);
  const suppress = useRef(false);
  const latest = useRef({ seat, enabled, select, place }); latest.current = { seat, enabled, select, place };
  useEffect(() => {
    function point(e: globalThis.PointerEvent) { const box = document.querySelector('.board-wrap')?.getBoundingClientRect(); return box ? screenToField(box, e.clientX, e.clientY, latest.current.seat) : null; }
    function move(e: globalThis.PointerEvent) {
      const g = gesture.current; if (!g || e.pointerId !== g.id) return;
      if (!g.dragged && dragIntent(g.origin, { x: e.clientX, y: e.clientY })) { g.dragged = true; setDragging(true); latest.current.select(g.slot); }
      if (g.dragged) { e.preventDefault(); setPreview(point(e)); setClient({ x: e.clientX, y: e.clientY }); }
    }
    function end(e: globalThis.PointerEvent) {
      const g = gesture.current; if (!g || e.pointerId !== g.id) return;
      gesture.current = null; setPreview(null); setDragging(false); setClient(null);
      if (g.dragged) { suppress.current = true; const p = point(e); if (p && latest.current.enabled && e.type === 'pointerup') latest.current.place(p.x, p.y, g.slot); }
    }
    function cancel(e: KeyboardEvent) { if (e.key === 'Escape') { gesture.current = null; setPreview(null); setDragging(false); setClient(null); } }
    window.addEventListener('pointermove', move, { passive: false }); window.addEventListener('pointerup', end); window.addEventListener('pointercancel', end); window.addEventListener('keydown', cancel);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', end); window.removeEventListener('pointercancel', end); window.removeEventListener('keydown', cancel); };
  }, []);
  return { preview, dragging, client, slot: gesture.current?.slot ?? null,
    start(slot: number, e: PointerEvent) { if (!enabled || e.button !== 0 || !e.isPrimary) return; suppress.current = false; gesture.current = { id: e.pointerId, slot, origin: { x: e.clientX, y: e.clientY }, dragged: false }; (e.target as HTMLElement).closest('button')?.setPointerCapture(e.pointerId); },
    clickCapture(e: React.MouseEvent) { if (suppress.current) { e.preventDefault(); e.stopPropagation(); suppress.current = false; } },
  };
}
