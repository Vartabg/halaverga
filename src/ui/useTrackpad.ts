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
import { tapShot } from '@/game/combat';
import { unlockBlasterAudio } from './audioUnlock';
import { HOVER, hoverFires } from './hoverPress';
/** fire: a free-trackpad press while stopped (blaster on) that fires once on release unless it drags (a drag only looks). */
type Press = { id: number; x: number; y: number; dragged: boolean; stoppedFlight: boolean; fire: boolean };
type Live = ReturnType<typeof useGame.getState>;
const hoverEnv = (g: Live) => ({ shooter: g.shooter, started: g.started, paused: g.paused, desktopMode: g.desktopMode, steering: g.trackpadSteering, touch: touchMode() });
const captureError = () => useGame.setState({ message: 'Mouse capture is unavailable. Choose Trackpad in Flight settings to continue.' });
export function useTrackpad(surface: RefObject<HTMLDivElement | null>) {
  // seen: last holds the real cursor position (false after the pointer leaves or play resumes, so the first move only seeds it).
  const press = useRef<Press | null>(null), last = useRef({ x: 0, y: 0 }), seen = useRef(false);
  const stroke = useRef(new ScrollStroke()), capture = useCruiseCapture(surface);
  const flow = useFlowTrackpad(surface, capture);
  const simple = useSimpleTrackpad(surface, capture);
  const isFlow = () => useGame.getState().desktopMode === 'trackpad' && useGame.getState().trackpadSteering === 'flow';
  const isSimple = () => useGame.getState().desktopMode === 'trackpad' && useGame.getState().trackpadSteering === 'simple';
  const cancelCapture = capture.cancel;
  const paused = useGame(s => s.paused);
  const dropPress = useCallback(() => { press.current = null; }, []);
  const halt = useCallback(() => { dropPress(); stroke.current.stop(performance.now()); cancelCapture(); stopTrackpad(); }, [cancelCapture, dropPress]);
  useEffect(() => {
    const element = surface.current; if (!element) return;
    // A state marker for tests and debugging: true while a click on the scene fires. The cursor stays visible (as at 7945430).
    const mark = (g: Live) => { const v = String(hoverFires(hoverEnv(g), g.trackpadFlying)); if (element.dataset.hoverFire !== v) element.dataset.hoverFire = v; };
    mark(useGame.getState());
    if (paused) return;
    stroke.current.stop(performance.now()); seen.current = false;
    const unsubscribe = useGame.subscribe((state, previous) => {
      mark(state);
      if (state.paused || (previous.trackpadFlying && !state.trackpadFlying)) { dropPress(); stroke.current.stop(performance.now()); }
      else if (press.current?.fire && !state.shooter) dropPress();
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
      document.removeEventListener('pointerlockerror', error); stopTrackpad(); dropPress();
    };
  }, [surface, paused, halt, dropPress]);
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
    stopTrackpad(); dropPress();
    // While cruising a press still only brakes (no shot); stopped with the blaster on, it fires instead of starting a cruise.
    const fire = !stoppedFlight && hoverFires(hoverEnv(useGame.getState()), false);
    press.current = { id: e.pointerId, x: e.clientX, y: e.clientY, dragged: false, stoppedFlight, fire };
    if (fire) unlockBlasterAudio();
    last.current = { x: e.clientX, y: e.clientY }; seen.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const move = (e: PointerEvent<HTMLDivElement>) => {
    if (isSimple()) { simple.move(e); return; }
    if (isFlow()) { flow.move(e); return; }
    if (useGame.getState().desktopMode !== 'trackpad' || useGame.getState().paused) return;
    if (document.pointerLockElement === e.currentTarget) return;
    if (!seen.current) { seen.current = true; last.current = { x: e.clientX, y: e.clientY }; }
    const p = press.current, cruising = runtime.trackpad.active;
    if (!p && !cruising) { last.current = { x: e.clientX, y: e.clientY }; return; }
    if (e.clientX < 0 || e.clientY < 0 || e.clientX > innerWidth || e.clientY > innerHeight) { halt(); return; }
    if (p && !p.dragged && Math.hypot(e.clientX - p.x, e.clientY - p.y) >= HOVER.dragPx) {
      // A drag only ever looks: the press no longer fires on release.
      p.dragged = true; p.fire = false;
    }
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
    if (p.fire) { if (!useGame.getState().paused && useGame.getState().shooter) tapShot(runtime.shooter); }
    else if (!p.dragged && !p.stoppedFlight && !useGame.getState().paused && useGame.getState().desktopMode === 'trackpad') {
      if (useGame.getState().trackpadSteering === 'captured') capture.request(); else startTrackpad();
    }
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  };
  // Releasing a completed click loses capture too; that must not cancel its new cruise.
  return { start, move, end, leave: () => { seen.current = false; if (!document.pointerLockElement && !isFlow() && !isSimple()) halt(); },
    cancel: () => { if (isSimple()) simple.cancel(); else if (isFlow()) flow.cancel(); else halt(); },
    lostCapture: () => { if (isSimple()) simple.lostCapture(); else if (isFlow()) flow.lostCapture(); else if (press.current) halt(); } };
}
