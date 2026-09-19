import { useEffect, useRef, type PointerEvent, type RefObject } from 'react';
import { brakeFlow, runtime, setFlowThrottle, stopTrackpad } from '@/game/runtime';
import { FlowStroke } from '@/game/flowFlight';
import { useGame } from '@/game/store';
import { recordGesture } from '@/game/gestureLog';

type Capture = { request: () => void; cancel: () => void };
const enabled = () => useGame.getState().desktopMode === 'trackpad' && useGame.getState().trackpadSteering === 'flow';
export function useFlowTrackpad(surface: RefObject<HTMLDivElement | null>, capture: Capture) {
  const press = useRef<{ id: number; x: number; y: number; dragged: boolean; epoch: number } | null>(null);
  const stroke = useRef(new FlowStroke()), epoch = useRef(-1);
  const paused = useGame(s => s.paused), cancelCapture = capture.cancel;
  const release = () => { press.current = null; brakeFlow(); cancelCapture(); stopTrackpad(); };
  useEffect(() => {
    const element = surface.current; if (!element || paused) return;
    const wheel = (e: WheelEvent) => {
      if (!enabled() || useGame.getState().paused) return;
      if (e.ctrlKey || e.metaKey) { recordGesture('zoom'); brakeFlow(); cancelCapture(); stopTrackpad(); return; }
      if (runtime.trackpad.capture !== 'engaged') return;
      if (e.cancelable) e.preventDefault();
      const now = performance.now();
      if (epoch.current !== runtime.trackpad.brakeEpoch || runtime.trackpad.held) {
        stroke.current.stop(runtime.trackpad.held ? now : runtime.trackpad.brakedAt); epoch.current = runtime.trackpad.brakeEpoch;
      }
      if (!runtime.trackpad.held) setFlowThrottle(stroke.current.apply(runtime.trackpad.throttle, e, now, innerHeight, useGame.getState().reverseScroll));
      recordGesture('flow-wheel', e);
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => element.removeEventListener('wheel', wheel);
  }, [surface, paused, cancelCapture]);
  const start = (e: PointerEvent<HTMLDivElement>) => {
    if (useGame.getState().paused || e.ctrlKey || e.metaKey) return;
    if (e.button === 2) { e.preventDefault(); recordGesture('flow-release'); release(); return; }
    if (e.button !== 0) return;
    if (document.pointerLockElement === e.currentTarget) {
      runtime.trackpad.held = true; brakeFlow(); stroke.current.stop(performance.now()); epoch.current = runtime.trackpad.brakeEpoch;
      recordGesture('flow-brake'); return;
    }
    if (runtime.trackpad.capture === 'requesting') { release(); return; }
    press.current = { id: e.pointerId, x: e.clientX, y: e.clientY, dragged: false, epoch: runtime.trackpad.cancelEpoch };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const move = (e: PointerEvent<HTMLDivElement>) => {
    const p = press.current;
    if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) >= 6) p.dragged = true;
  };
  const end = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    if (runtime.trackpad.held) {
      runtime.trackpad.held = false; stroke.current.stop(performance.now()); recordGesture('flow-release-brake'); return;
    }
    const p = press.current; if (!p || p.id !== e.pointerId) return;
    press.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (!p.dragged && p.epoch === runtime.trackpad.cancelEpoch && !useGame.getState().paused && enabled()) capture.request();
  };
  return { start, move, end, cancel: release, lostCapture: () => { if (press.current) release(); } };
}
