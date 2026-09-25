import { useEffect, type RefObject } from 'react';
import { look, runtime } from '@/game/runtime';
import { useGame } from '@/game/store';
import { deskEdge } from '@/game/thumbFlight';
import { exitKind } from '@/game/trackpadFlight';
import { recordGesture } from '@/game/gestureLog';
import { touchMode } from '@/game/pointerMode';
// Desktop free cursor while cruising (turn-360 spec 1.5): the cursor is tracked by window listeners, so the header and its buttons
// no longer count as leaving and a windowed browser keeps steering. A side exit keeps the full edge turn (edgeTurn.ts holds it up to
// 6 s); a top or bottom exit flies straight after 1 s. A blur or a hidden page drops the edge turn and the cruise flies straight.
// Braking stays with a click, Space, Escape or pause, or a lab switch (clearInput). Every handler does nothing unless cruising.
type Point = { x: number; y: number };
const clamp = (v: number, hi: number) => Math.max(0, Math.min(hi, v));
const cruising = () => runtime.trackpad.active && !document.pointerLockElement && !touchMode();
/** last/seen are shared with useTrackpad: last is the latest cursor point, seen false until a move seeds it (no jump on re-entry). */
export function useTrackpadWindow(last: RefObject<Point>, seen: RefObject<boolean>) {
  const paused = useGame(s => s.paused), mode = useGame(s => s.desktopMode), steering = useGame(s => s.trackpadSteering);
  useEffect(() => {
    if (paused || mode !== 'trackpad' || steering === 'simple' || steering === 'flow') return;
    const tp = runtime.trackpad;
    const move = (e: PointerEvent) => {
      if (!cruising() || e.pointerType === 'touch') return;
      const x = clamp(e.clientX, innerWidth), y = clamp(e.clientY, innerHeight), p = last.current;
      if (seen.current) {
        const dx = x - p.x, dy = y - p.y;
        if (dx || dy) { look(dx, dy); recordGesture('steer', { deltaX: dx, deltaY: dy }); }
      }
      seen.current = true; p.x = x; p.y = y;
      tp.edgeTurn = deskEdge(x, innerWidth); tp.edgePitch = -deskEdge(y, innerHeight);
      tp.edgeAge = 0; tp.outside = 0; tp.outsideAge = 0;
    };
    const out = (e: PointerEvent) => {
      if (!cruising() || e.relatedTarget !== null || e.pointerType === 'touch') return;
      // The out event carries the exit point itself, which beats the last move after a fast flick off the side.
      const x = clamp(e.clientX, innerWidth), y = clamp(e.clientY, innerHeight);
      tp.outside = exitKind(x, y, innerWidth, innerHeight); tp.outsideAge = 0; seen.current = false;
      if (tp.outside === 1) { tp.edgeTurn = x < innerWidth / 2 ? -1 : 1; tp.edgePitch = 0; tp.edgeAge = 0; }
    };
    const calm = () => { if (!runtime.trackpad.active) return; tp.outside = 0; tp.outsideAge = 0; tp.edgeTurn = tp.edgePitch = 0; seen.current = false; };
    const blur = () => calm();
    const visible = () => { if (document.visibilityState === 'hidden') calm(); };
    addEventListener('pointermove', move); addEventListener('pointerout', out); addEventListener('blur', blur);
    document.addEventListener('visibilitychange', visible);
    return () => {
      removeEventListener('pointermove', move); removeEventListener('pointerout', out); removeEventListener('blur', blur);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [paused, mode, steering, last, seen]);
}
