import { useCallback, useEffect, useRef, type PointerEvent, type RefObject } from 'react';
import { brakeFlow, look, runtime, stopTrackpad } from '@/game/runtime';
import { useGame } from '@/game/store';
import { recordGesture } from '@/game/gestureLog';
import { simplePrimaryPress } from './shooterKeys';
import { readEnv } from './useShooterInput';

type Capture = { request: () => void; cancel: () => void };
const enabled = () => useGame.getState().desktopMode === 'trackpad' && useGame.getState().trackpadSteering === 'simple';
export function useSimpleTrackpad(surface: RefObject<HTMLDivElement | null>, capture: Capture) {
  const press = useRef<{ id: number; x: number; y: number; dragged: boolean; epoch: number } | null>(null);
  const last = useRef({ x: 0, y: 0 }), paused = useGame(s => s.paused), cancelCapture = capture.cancel;
  const release = useCallback(() => {
    press.current = null; brakeFlow(); cancelCapture(); stopTrackpad();
  }, [cancelCapture]);
  useEffect(() => {
    const element = surface.current; if (!element || paused) return;
    // Scrolling never propels this profile. Pinch retains browser zoom and stops flight.
    const wheel = (e: WheelEvent) => {
      if (enabled() && (e.ctrlKey || e.metaKey)) { recordGesture('zoom'); release(); }
    };
    element.addEventListener('wheel', wheel, { passive: true });
    return () => element.removeEventListener('wheel', wheel);
  }, [surface, paused, release]);
  const start = (e: PointerEvent<HTMLDivElement>) => {
    const route = simplePrimaryPress(e, readEnv(), runtime.trackpad.capture === 'requesting');
    // 'fire' never arrives: useShooterInput's capture-phase swallowsPress stops that same route first. A shot keeps pointer and flight.
    if (route === 'ignore' || route === 'fire') return;
    if (route === 'brake') { recordGesture('simple-brake'); release(); return; }
    press.current = { id: e.pointerId, x: e.clientX, y: e.clientY, dragged: false, epoch: runtime.trackpad.cancelEpoch };
    last.current = { x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const move = (e: PointerEvent<HTMLDivElement>) => {
    const p = press.current;
    if (!p || p.id !== e.pointerId || p.epoch !== runtime.trackpad.cancelEpoch || useGame.getState().paused) return;
    if (Math.hypot(e.clientX - p.x, e.clientY - p.y) >= 6) p.dragged = true;
    if (p.dragged) look(e.clientX - last.current.x, e.clientY - last.current.y, useGame.getState().lookSensitivity);
    last.current = { x: e.clientX, y: e.clientY };
  };
  const end = (e: PointerEvent<HTMLDivElement>) => {
    const p = press.current; if (e.button !== 0 || !p || p.id !== e.pointerId) return;
    press.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (!p.dragged && p.epoch === runtime.trackpad.cancelEpoch && !useGame.getState().paused && enabled()) capture.request();
  };
  return { start, move, end, cancel: release, lostCapture: () => { if (press.current) release(); } };
}
