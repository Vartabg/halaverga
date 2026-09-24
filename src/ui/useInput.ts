import { useEffect } from 'react';
import { clearInput, look, runtime, toggleSurge, readIntent, releaseHeldInput, releaseKeys } from '@/game/runtime';
import { moving } from '@/game/motion';
import { persistGame, useGame } from '@/game/store';
import { recordGesture } from '@/game/gestureLog';
import { touchMode } from '@/game/pointerMode';
import { isOrientationFlip, isPlaying, orientationOf } from './playLifecycle';
export function pause() {
  recordGesture('pause');
  clearInput(true); useGame.setState({ paused: true, landing: false });
  if (document.pointerLockElement) document.exitPointerLock();
}
export function resume() {
  clearInput(true); runtime.skipSample = true;
  // Playing again answers any "Leave the game?" prompt raised while a dialog hid it.
  useGame.setState({ started: true, paused: false, panel: false, journal: false, message: '', leavePrompt: false });
}
export function useInput() {
  useEffect(() => {
    const controls = ['KeyW','KeyA','KeyS','KeyD','KeyR','KeyF','ArrowLeft','ArrowRight','ArrowUp','ArrowDown'];
    const keydown = (e: KeyboardEvent) => {
      const state = useGame.getState();
      if (e.code === 'Escape') { if (state.started && !state.panel && !state.journal) pause(); return; }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (state.paused || /INPUT|SELECT|TEXTAREA/.test((e.target as HTMLElement).tagName)) return;
      if (runtime.trackpad.held && state.trackpadSteering === 'flow') return;
      // A held key must be released and pressed again after a brake or interruption.
      if (e.repeat && !runtime.keys.has(e.code)) return;
      if (controls.includes(e.code)) { e.preventDefault(); runtime.keys.add(e.code); }
      if (e.repeat) return;
      if (e.code === 'Space' && (e.target as HTMLElement).tagName !== 'BUTTON') { e.preventDefault(); runtime.lift = true; }
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') { e.preventDefault(); toggleSurge(); }
      if (e.code === 'KeyE' && state.nearTerminal) { pause(); useGame.setState({ journal: true }); }
    };
    const keyup = (e: KeyboardEvent) => {
      runtime.keys.delete(e.code);
      if (controls.includes(e.code) && !moving(readIntent())) runtime.surge = false;
    };
    const mouse = (e: MouseEvent) => {
      if (document.pointerLockElement && !useGame.getState().paused) {
        const state = useGame.getState();
        look(e.movementX, e.movementY, state.desktopMode === 'trackpad' && ['flow', 'simple'].includes(state.trackpadSteering) ? state.lookSensitivity : 1);
        recordGesture('captured-steer', { deltaX: e.movementX, deltaY: e.movementY });
      }
    };
    // Touch or desktop is decided when each event fires (the last pointer type), so an iPad with a trackpad switches cleanly.
    // Touch: a blur only drops keyboard keys and keeps playing; fingers keep their controls (iOS cancels them itself when the
    // system takes the touches), and only leaving the page pauses.
    const blur = () => { if (!touchMode()) pause(); else if (isPlaying(useGame.getState())) releaseKeys(); };
    const liveGame = () => { const g = useGame.getState(); return g.started && !g.paused; };
    const hidden = () => { if (document.hidden && liveGame()) pause(); };
    // Leaving (tab switch, back swipe past the sentinel, app switch): pause and save; bfcache restores come back paused.
    const pagehide = () => { if (liveGame()) pause(); if (useGame.getState().started) persistGame(); };
    const pageshow = (e: PageTransitionEvent) => { if (e.persisted && liveGame()) pause(); };
    // The layout viewport (not the visual one) so a pinch zoom never reads as a rotation.
    const layoutOrientation = () => orientationOf(document.documentElement.clientWidth || innerWidth, document.documentElement.clientHeight || innerHeight);
    let orientation = layoutOrientation();
    const resized = () => {
      const next = layoutOrientation(), flipped = isOrientationFlip(orientation, next);
      orientation = next;
      // Touch: Safari's toolbar resizes change nothing; a rotation releases held input and keeps playing.
      if (touchMode()) { if (flipped) releaseHeldInput(); return; }
      clearInput(true); if (document.pointerLockElement) document.exitPointerLock(); useGame.setState(s => ({ landing: false, inputEpoch: s.inputEpoch + 1 }));
    };
    const lock = () => {
      if (!document.pointerLockElement) {
        const expected = runtime.trackpad.unlocking; runtime.trackpad.unlocking = false;
        if (useGame.getState().started && !useGame.getState().paused) {
          if (useGame.getState().desktopMode === 'trackpad' && expected) clearInput(); else pause();
        }
      }
    };
    window.addEventListener('keydown', keydown); window.addEventListener('keyup', keyup);
    window.addEventListener('mousemove', mouse); window.addEventListener('blur', blur); window.addEventListener('resize', resized);
    window.addEventListener('pagehide', pagehide); window.addEventListener('pageshow', pageshow);
    document.addEventListener('visibilitychange', hidden); document.addEventListener('pointerlockchange', lock);
    window.screen.orientation?.addEventListener('change', resized);
    return () => {
      window.removeEventListener('keydown', keydown); window.removeEventListener('keyup', keyup); window.removeEventListener('mousemove', mouse);
      window.removeEventListener('blur', blur); window.removeEventListener('resize', resized);
      window.removeEventListener('pagehide', pagehide); window.removeEventListener('pageshow', pageshow);
      document.removeEventListener('visibilitychange', hidden); document.removeEventListener('pointerlockchange', lock);
      window.screen.orientation?.removeEventListener('change', resized); clearInput(true);
    };
  }, []);
}
