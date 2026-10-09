import { useEffect, useRef } from 'react';
import { releaseAim, releaseFire, resetShooterInput } from '@/game/combat';
import { runtime } from '@/game/runtime';
import { useGame } from '@/game/store';
import { touchCapable, touchMode } from '@/game/pointerMode';
import { keyDown, keyUp, lockedClickFire, lookSourceFor, mouseDown, mouseUp, OWN_LOOK_SELECTOR, swallowsPress, type ShooterEnv } from './shooterKeys';
// A separate listener set (useInput and the trackpad hooks stay untouched). Handlers write runtime.shooter.input only.
const env: ShooterEnv = { enabled: false, started: false, paused: true, aimToggle: false, desktopMode: 'trackpad', steering: 'free', locked: false };
/** The single ShooterEnv reader (also used by useSimpleTrackpad). `locked` is any pointer lock: under a lock every pointer event
 * targets the locked element, so when the flight surface receives a press this equals PR #12's `pointerLockElement === surface`. */
export function readEnv() {
  const g = useGame.getState();
  env.enabled = g.shooter; env.started = g.started; env.paused = g.paused; env.aimToggle = g.aimToggle;
  env.desktopMode = g.desktopMode; env.steering = g.trackpadSteering; env.locked = !!document.pointerLockElement;
  return env;
}
const ownsLook = (target: EventTarget | null) => !!(target as Element | null)?.closest?.(OWN_LOOK_SELECTOR);
export function useShooterInput(options?: { unlock?: () => void }) {
  const unlock = useRef(options?.unlock);
  useEffect(() => { unlock.current = options?.unlock; });
  useEffect(() => {
    const s = runtime.shooter, on = () => useGame.getState().shooter;
    const keydown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName ?? '';
      if (!keyDown({ code: e.code, repeat: e.repeat, metaKey: e.metaKey, ctrlKey: e.ctrlKey, altKey: e.altKey, targetTag: tag }, readEnv(), s)) return;
      e.preventDefault(); unlock.current?.();
    };
    const keyup = (e: KeyboardEvent) => keyUp(e.code, readEnv(), s);
    const tag = (e: PointerEvent) => { if (!ownsLook(e.target)) s.input.lookSource = lookSourceFor(e.pointerType, useGame.getState().desktopMode, touchCapable()); };
    const pointerdown = (e: PointerEvent) => {
      if (!on()) return;
      tag(e);
      if (e.pointerType === 'mouse') {
        // The fire click replaces the simple profile's brake-and-free click; no preventDefault, so mousedown still fires for chords.
        if (swallowsPress(e, readEnv(), runtime.trackpad.capture === 'requesting')) e.stopPropagation();
        if (s.input.touchId !== null) { releaseFire(s, 'touch'); s.input.touchId = null; }
      } else if (e.pointerType === 'touch') {
        if (s.input.fireSource === 'keys' || s.input.fireSource === 'click') releaseFire(s, s.input.fireSource);
      }
    };
    const pointermove = (e: PointerEvent) => { if (on()) tag(e); };
    const mousedown = (e: MouseEvent) => { if (mouseDown(e.button, readEnv(), s)) unlock.current?.(); };
    const mouseup = (e: MouseEvent) => mouseUp(e.button, readEnv(), s);
    const pointerup = (e: PointerEvent) => { if (s.input.fireSource === 'click' && lockedClickFire(readEnv())) e.stopPropagation(); };
    const lock = () => {
      if (document.pointerLockElement) return;
      releaseFire(s, 'click');
      if (useGame.getState().desktopMode === 'mouse') releaseAim(s);
    };
    // Desktop only, decided when the event fires (last pointer type): iPhone Safari fires gesturestart for any second finger,
    // which would drop a two-thumb Fire hold; an iPad with a trackpad still gets the desktop reset.
    const zoom = () => { if (touchMode()) return; if (on() && s.input.touchId === null) resetShooterInput(s); };
    const wheel = (e: WheelEvent) => { if (e.ctrlKey || e.metaKey) zoom(); };
    const cap = { capture: true }, passive = { capture: true, passive: true };
    window.addEventListener('keydown', keydown); window.addEventListener('keyup', keyup);
    window.addEventListener('pointerdown', pointerdown, cap); window.addEventListener('pointermove', pointermove, passive);
    window.addEventListener('mousedown', mousedown, cap); window.addEventListener('mouseup', mouseup, cap);
    window.addEventListener('pointerup', pointerup, cap); document.addEventListener('pointerlockchange', lock);
    window.addEventListener('wheel', wheel, passive); window.addEventListener('gesturestart', zoom);
    return () => {
      window.removeEventListener('keydown', keydown); window.removeEventListener('keyup', keyup);
      window.removeEventListener('pointerdown', pointerdown, cap); window.removeEventListener('pointermove', pointermove, passive);
      window.removeEventListener('mousedown', mousedown, cap); window.removeEventListener('mouseup', mouseup, cap);
      window.removeEventListener('pointerup', pointerup, cap); document.removeEventListener('pointerlockchange', lock);
      window.removeEventListener('wheel', wheel, passive); window.removeEventListener('gesturestart', zoom);
      resetShooterInput(s);
    };
  }, []);
}
