import { useCallback, useEffect, useRef, type RefObject } from 'react';
import { startFlow, startTrackpad, stopTrackpad, runtime } from '@/game/runtime';
import { useGame } from '@/game/store';

export function useCruiseCapture(surface: RefObject<HTMLDivElement | null>) {
  const pending = useRef(false);
  const generation = useRef(0);
  const requestedProfile = useRef(useGame.getState().trackpadSteering);
  const cancel = useCallback(() => {
    pending.current = false; generation.current++;
    runtime.trackpad.capture = 'idle';
    if (surface.current && document.pointerLockElement === surface.current) { runtime.trackpad.unlocking = true; document.exitPointerLock(); }
  }, [surface]);
  const fail = useCallback(() => {
    if (!pending.current) return;
    cancel(); stopTrackpad();
    if (useGame.getState().trackpadSteering === 'flow') {
      runtime.trackpad.captureFailed = true;
      useGame.setState({ message: 'Flow could not capture the pointer. Click the scene to retry, or use free cursor controls.' });
    } else useGame.setState({ trackpadSteering: 'free', message: 'Captured steering is unavailable. Free cursor steering is ready; click to fly.' });
  }, [cancel]);
  const activate = useCallback(() => {
    const state = useGame.getState();
    if (!surface.current || document.pointerLockElement !== surface.current) return;
    if (pending.current && runtime.trackpad.capture === 'requesting' && !state.paused && state.desktopMode === 'trackpad' && state.trackpadSteering === requestedProfile.current && state.trackpadSteering !== 'free') {
      pending.current = false;
      if (state.trackpadSteering === 'flow') startFlow(); else { startTrackpad(); runtime.trackpad.capture = 'engaged'; }
    } else if (!runtime.trackpad.active) cancel();
  }, [surface, cancel]);
  useEffect(() => {
    const element = surface.current;
    const changed = () => {
      if (element && document.pointerLockElement === element) activate();
      else stopTrackpad();
    };
    const unsubscribe = useGame.subscribe((state, previous) => {
      if (state.paused || state.panel || state.journal || state.inputEpoch !== previous.inputEpoch || state.desktopMode !== 'trackpad' || state.trackpadSteering === 'free' || state.trackpadSteering !== previous.trackpadSteering ||
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
    requestedProfile.current = useGame.getState().trackpadSteering;
    runtime.trackpad.capture = 'requesting';
    if (runtime.trackpad.captureFailed) useGame.setState({ message: '' });
    runtime.trackpad.captureFailed = false;
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
