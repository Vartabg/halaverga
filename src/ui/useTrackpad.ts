import { useEffect, useRef, type PointerEvent, type RefObject } from 'react';
import { look, runtime, startTrackpad, stopTrackpad } from '@/game/runtime';
import { thumbEdge } from '@/game/thumbFlight';
import { cruiseThrottle } from '@/game/trackpadFlight';
import { useGame } from '@/game/store';
type Press = { id: number; x: number; y: number; dragged: boolean; stoppedFlight: boolean };
const captureError = () => useGame.setState({ message: 'Mouse capture is unavailable. Choose Trackpad in Flight settings to continue.' });
export function useTrackpad(surface: RefObject<HTMLDivElement | null>) {
  const press = useRef<Press | null>(null), last = useRef({ x: 0, y: 0 });
  const paused = useGame(s => s.paused);
  const halt = () => { press.current = null; stopTrackpad(); };
  useEffect(() => {
    const element = surface.current; if (!element || paused) return;
    const wheel = (e: WheelEvent) => {
      if (useGame.getState().paused || useGame.getState().desktopMode !== 'trackpad') return;
      if (e.ctrlKey || e.metaKey) { press.current = null; stopTrackpad(); return; }
      if (e.cancelable) e.preventDefault();
      if (runtime.trackpad.active && Math.abs(e.deltaY) >= Math.abs(e.deltaX) * .5) {
        runtime.trackpad.throttle = cruiseThrottle(runtime.trackpad.throttle, e.deltaY, e.deltaMode, innerHeight);
      }
    };
    const zoom = () => { press.current = null; stopTrackpad(); };
    const error = () => captureError();
    element.addEventListener('wheel', wheel, { passive: false });
    element.addEventListener('gesturestart', zoom);
    document.addEventListener('pointerlockerror', error);
    return () => {
      element.removeEventListener('wheel', wheel); element.removeEventListener('gesturestart', zoom);
      document.removeEventListener('pointerlockerror', error); stopTrackpad();
    };
  }, [surface, paused]);
  const start = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || e.ctrlKey || e.metaKey || useGame.getState().paused) return;
    if (useGame.getState().desktopMode === 'mouse') {
      if (!document.pointerLockElement) {
        const canvas = document.querySelector('canvas');
        if (!canvas?.requestPointerLock) captureError();
        else { try { canvas.requestPointerLock()?.catch(captureError); } catch { captureError(); } }
      }
      return;
    }
    press.current = { id: e.pointerId, x: e.clientX, y: e.clientY, dragged: false, stoppedFlight: runtime.trackpad.active };
    last.current = { x: e.clientX, y: e.clientY };
    stopTrackpad(); e.currentTarget.setPointerCapture(e.pointerId);
  };
  const move = (e: PointerEvent<HTMLDivElement>) => {
    if (useGame.getState().desktopMode !== 'trackpad' || useGame.getState().paused) return;
    const p = press.current, cruising = runtime.trackpad.active;
    if (!p && !cruising) return;
    if (e.clientX < 0 || e.clientY < 0 || e.clientX > innerWidth || e.clientY > innerHeight) { halt(); return; }
    if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) >= 6) p.dragged = true;
    if (cruising || p?.dragged) look(e.clientX - last.current.x, e.clientY - last.current.y);
    last.current = { x: e.clientX, y: e.clientY };
    if (cruising) {
      runtime.trackpad.edgeTurn = thumbEdge(e.clientX, innerWidth);
      runtime.trackpad.edgePitch = -thumbEdge(e.clientY, innerHeight);
    }
  };
  const end = (e: PointerEvent<HTMLDivElement>) => {
    const p = press.current; if (!p || p.id !== e.pointerId) return;
    press.current = null;
    if (!p.dragged && !p.stoppedFlight && !useGame.getState().paused && useGame.getState().desktopMode === 'trackpad') startTrackpad();
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  };
  // Releasing a completed click loses capture too; that must not cancel its new cruise.
  return { start, move, end, leave: halt, cancel: halt, lostCapture: () => { if (press.current) halt(); } };
}
