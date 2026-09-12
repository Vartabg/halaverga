import { useCallback, useEffect, useRef, type RefObject } from 'react';
import { startTrackpad, stopTrackpad, runtime } from '@/game/runtime';
import { useGame } from '@/game/store';

export function useCruiseCapture(surface: RefObject<HTMLDivElement | null>) {
  const pending = useRef(false);
  const generation = useRef(0);
  const cancel = useCallback(() => {
    pending.current = false; generation.current++;
    if (surface.current && document.pointerLockElement === surface.current) { runtime.trackpad.unlocking = true; document.exitPointerLock(); }
  }, [surface]);
  const fail = useCallback(() => {
    if (!pending.current) return;
    cancel(); stopTrackpad();
    useGame.setState({ trackpadSteering: 'free', message: 'Captured steering is unavailable. Free cursor steering is ready; click to fly.' });
  }, [cancel]);
  const activate = useCallback(() => {
    const state = useGame.getState();
    if (!surface.current || document.pointerLockElement !== surface.current) return;
    if (pending.current && !state.paused && state.desktopMode === 'trackpad' && state.trackpadSteering === 'captured') {
      pending.current = false; startTrackpad();
    } else if (!runtime.trackpad.active) cancel();
  }, [surface, cancel]);
  useEffect(() => {
    const element = surface.current;
    const changed = () => {
      if (element && document.pointerLockElement === element) activate();
      else stopTrackpad();
    };
    const unsubscribe = useGame.subscribe((state, previous) => {
      if (state.paused || state.desktopMode !== 'trackpad' || state.trackpadSteering !== 'captured' ||
        (previous.trackpadFlying && !state.trackpadFlying)) cancel();
    });
    document.addEventListener('pointerlockchange', changed);
    document.addEventListener('pointerlockerror', fail);
    return () => {
      pending.current = false; generation.current++; unsubscribe();
      document.removeEventListener('pointerlockchange', changed);
      document.removeEventListener('pointerlockerror', fail);
      if (element && document.pointerLockElement === element) { runtime.trackpad.unlocking = true; document.exitPointerLock(); }
    };
  }, [surface, activate, cancel, fail]);
  const request = () => {
    if (pending.current) { cancel(); return; }
    pending.current = true;
    const ticket = ++generation.current, element = surface.current;
    try {
      if (!element?.requestPointerLock) { fail(); return; }
      element.requestPointerLock()?.then(() => {
        if (generation.current === ticket) activate();
        else if (document.pointerLockElement === element && !runtime.trackpad.active) { runtime.trackpad.unlocking = true; document.exitPointerLock(); }
      }).catch(() => { if (generation.current === ticket) fail(); });
    } catch { fail(); }
  };
  return { request, cancel };
}
