import { useCallback, useEffect, useRef, type PointerEvent, type RefObject } from 'react';
import { brakeFlow, look, runtime, startTrackpad, stopTrackpad } from '@/game/runtime';
import { thumbEdge } from '@/game/thumbFlight';
import { ScrollStroke } from '@/game/trackpadFlight';
import { useGame } from '@/game/store';
import { useCruiseCapture } from './useCruiseCapture';
import { useFlowTrackpad } from './useFlowTrackpad';
import { useSimpleTrackpad } from './useSimpleTrackpad';
import { recordGesture } from '@/game/gestureLog';
import { touchMode } from '@/game/pointerMode';
type Press = { id: number; x: number; y: number; dragged: boolean; stoppedFlight: boolean };
const captureError = () => useGame.setState({ message: 'Mouse capture is unavailable. Choose Trackpad in Flight settings to continue.' });
export function useTrackpad(surface: RefObject<HTMLDivElement | null>) {
  const press = useRef<Press | null>(null), last = useRef({ x: 0, y: 0 });
  const stroke = useRef(new ScrollStroke()), capture = useCruiseCapture(surface);
  const flow = useFlowTrackpad(surface, capture);
  const simple = useSimpleTrackpad(surface, capture);
  const isFlow = () => useGame.getState().desktopMode === 'trackpad' && useGame.getState().trackpadSteering === 'flow';
  const isSimple = () => useGame.getState().desktopMode === 'trackpad' && useGame.getState().trackpadSteering === 'simple';
  const cancelCapture = capture.cancel;
  const paused = useGame(s => s.paused);
  const halt = useCallback(() => { press.current = null; stroke.current.stop(performance.now()); cancelCapture(); stopTrackpad(); }, [cancelCapture]);
  useEffect(() => {
    const element = surface.current; if (!element || paused) return;
    stroke.current.stop(performance.now());
    const unsubscribe = useGame.subscribe((state, previous) => {
      if (state.paused || (previous.trackpadFlying && !state.trackpadFlying)) { press.current = null; stroke.current.stop(performance.now()); }
    });
    const wheel = (e: WheelEvent) => {
      if (useGame.getState().paused || useGame.getState().desktopMode !== 'trackpad') return;
      if (['flow', 'simple'].includes(useGame.getState().trackpadSteering)) return;
      if (e.ctrlKey || e.metaKey) { recordGesture('zoom'); halt(); return; }
      if (e.cancelable) e.preventDefault();
      const next = stroke.current.apply(runtime.trackpad.throttle, e, performance.now(), innerHeight, useGame.getState().reverseScroll);
      if (runtime.trackpad.active) runtime.trackpad.throttle = next;
      recordGesture('wheel', e);
    };
    // Desktop only, decided when the event fires: iPhone Safari fires gesturestart for any second finger (two-thumb play).
    const zoom = () => { if (touchMode()) return; if (['flow', 'simple'].includes(useGame.getState().trackpadSteering)) brakeFlow(); halt(); };
    const error = () => { if (useGame.getState().desktopMode === 'mouse') captureError(); };
    element.addEventListener('wheel', wheel, { passive: false });
    element.addEventListener('gesturestart', zoom);
    document.addEventListener('pointerlockerror', error);
    return () => {
      unsubscribe();
      element.removeEventListener('wheel', wheel); element.removeEventListener('gesturestart', zoom);
      document.removeEventListener('pointerlockerror', error); stopTrackpad();
    };
  }, [surface, paused, halt]);
  const start = (e: PointerEvent<HTMLDivElement>) => {
    if (isSimple()) { simple.start(e); return; }
    if (isFlow()) { flow.start(e); return; }
    if (e.button !== 0 || e.ctrlKey || e.metaKey || useGame.getState().paused) return;
    if (useGame.getState().desktopMode === 'mouse') {
      if (!document.pointerLockElement) {
        const canvas = document.querySelector('canvas');
        if (!canvas?.requestPointerLock) captureError();
        else { try { canvas.requestPointerLock()?.catch(captureError); } catch { captureError(); } }
      }
      return;
    }
    if (document.pointerLockElement === e.currentTarget) { recordGesture('brake'); halt(); return; }
    const stoppedFlight = runtime.trackpad.active;
    recordGesture(stoppedFlight ? 'brake' : 'press');
    stroke.current.stop(performance.now());
    stopTrackpad();
    press.current = { id: e.pointerId, x: e.clientX, y: e.clientY, dragged: false, stoppedFlight };
    last.current = { x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const move = (e: PointerEvent<HTMLDivElement>) => {
    if (isSimple()) { simple.move(e); return; }
    if (isFlow()) { flow.move(e); return; }
    if (useGame.getState().desktopMode !== 'trackpad' || useGame.getState().paused) return;
    if (document.pointerLockElement === e.currentTarget) return;
    const p = press.current, cruising = runtime.trackpad.active;
    if (!p && !cruising) return;
    if (e.clientX < 0 || e.clientY < 0 || e.clientX > innerWidth || e.clientY > innerHeight) { halt(); return; }
    if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) >= 6) p.dragged = true;
    if (cruising || p?.dragged) look(e.clientX - last.current.x, e.clientY - last.current.y);
    recordGesture('steer', { deltaX: e.clientX - last.current.x, deltaY: e.clientY - last.current.y });
    last.current = { x: e.clientX, y: e.clientY };
    if (cruising) {
      runtime.trackpad.edgeTurn = thumbEdge(e.clientX, innerWidth);
      runtime.trackpad.edgePitch = -thumbEdge(e.clientY, innerHeight);
      runtime.trackpad.edgeAge = 0;
    }
  };
  const end = (e: PointerEvent<HTMLDivElement>) => {
    if (isSimple()) { simple.end(e); return; }
    if (isFlow()) { flow.end(e); return; }
    const p = press.current; if (!p || p.id !== e.pointerId) return;
    press.current = null;
    if (!p.dragged && !p.stoppedFlight && !useGame.getState().paused && useGame.getState().desktopMode === 'trackpad') {
      if (useGame.getState().trackpadSteering === 'captured') capture.request(); else startTrackpad();
    }
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  };
  // Releasing a completed click loses capture too; that must not cancel its new cruise.
  return { start, move, end, leave: () => { if (!document.pointerLockElement && !isFlow() && !isSimple()) halt(); },
    cancel: () => { if (isSimple()) simple.cancel(); else if (isFlow()) flow.cancel(); else halt(); },
    lostCapture: () => { if (isSimple()) simple.lostCapture(); else if (isFlow()) flow.lostCapture(); else if (press.current) halt(); } };
}
