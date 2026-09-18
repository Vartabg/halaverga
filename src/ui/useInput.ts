import { useEffect } from 'react';
import { clearInput, look, runtime, toggleSurge, readIntent } from '@/game/runtime';
import { moving } from '@/game/motion';
import { useGame } from '@/game/store';
import { recordGesture } from '@/game/gestureLog';
export function pause() {
  recordGesture('pause');
  clearInput(true); useGame.setState({ paused: true, landing: false });
  if (document.pointerLockElement) document.exitPointerLock();
}
export function resume() {
  clearInput(true); runtime.skipSample = true; useGame.setState({ started: true, paused: false, panel: false, journal: false, message: '' });
}
export function useInput() {
  useEffect(() => {
    const controls = ['KeyW','KeyA','KeyS','KeyD','KeyR','KeyF','ArrowLeft','ArrowRight','ArrowUp','ArrowDown'];
    const keydown = (e: KeyboardEvent) => {
      const state = useGame.getState();
      if (e.code === 'Escape') { if (state.started && !state.panel && !state.journal) pause(); return; }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (state.paused || /INPUT|SELECT|TEXTAREA/.test((e.target as HTMLElement).tagName)) return;
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
        look(e.movementX, e.movementY); recordGesture('captured-steer', { deltaX: e.movementX, deltaY: e.movementY });
      }
    };
    const hidden = () => { if (document.hidden) pause(); };
    const resized = () => { clearInput(true); if (document.pointerLockElement) document.exitPointerLock(); useGame.setState(s => ({ landing: false, inputEpoch: s.inputEpoch + 1 })); };
    const lock = () => {
      if (!document.pointerLockElement) {
        const expected = runtime.trackpad.unlocking; runtime.trackpad.unlocking = false;
        if (useGame.getState().started && !useGame.getState().paused) {
          if (useGame.getState().desktopMode === 'trackpad' && expected) clearInput(); else pause();
        }
      }
    };
    window.addEventListener('keydown', keydown); window.addEventListener('keyup', keyup);
    window.addEventListener('mousemove', mouse); window.addEventListener('blur', pause); window.addEventListener('resize', resized);
    document.addEventListener('visibilitychange', hidden); document.addEventListener('pointerlockchange', lock);
    window.screen.orientation?.addEventListener('change', resized);
    return () => {
      window.removeEventListener('keydown', keydown); window.removeEventListener('keyup', keyup); window.removeEventListener('mousemove', mouse);
      window.removeEventListener('blur', pause); window.removeEventListener('resize', resized);
      document.removeEventListener('visibilitychange', hidden); document.removeEventListener('pointerlockchange', lock);
      window.screen.orientation?.removeEventListener('change', resized); clearInput(true);
    };
  }, []);
}
