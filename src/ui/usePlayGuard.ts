import { useEffect } from 'react';
import { notePointer, touchCapable, touchMode } from '@/game/pointerMode';
import { useGame } from '@/game/store';
import { isPlaying } from './playLifecycle';
import { releaseWakeLock, requestWakeLock } from './playSession';
import { pause } from './useInput';
import { useTouchCapable } from './useTouchCapable';
// Browser protection while playing. On the landing first load: no three.js and no blaster markers.
// There is deliberately no touchstart handler: it cannot stop the iOS edge back swipe and would kill taps (Pause's edge).
const ZOOMED = 1.01;
const inside = (target: EventTarget | null, selector: string) => !!(target as Element | null)?.closest?.(selector);
const writeInput = () => { document.documentElement.dataset.input = touchMode() ? 'touch' : 'mouse'; };

export function usePlayGuard() {
  const playing = useGame(isPlaying);
  const started = useGame(s => s.started);
  const paused = useGame(s => s.paused);
  const capable = useTouchCapable();

  // Always: remember the last pointer type (touch vs desktop is decided per event, so an iPad with a trackpad works).
  useEffect(() => {
    writeInput();
    const down = (e: PointerEvent) => { if (notePointer(e.pointerType)) writeInput(); };
    const opts = { capture: true, passive: true };
    document.addEventListener('pointerdown', down, opts);
    return () => document.removeEventListener('pointerdown', down, opts);
  }, []);

  // While playing: lock the page (CSS under html[data-playing]) and swallow Safari's scroll, zoom, callout and selection.
  // Touch-capable devices only: a desktop that has never shown touch keeps a normal page, its right-click menu and no zoom pause.
  useEffect(() => {
    if (!playing || !capable) return;
    const root = document.documentElement;
    root.dataset.playing = 'true';
    const opts: AddEventListenerOptions = { capture: true, passive: false };
    const touchmove = (e: TouchEvent) => {
      if (e.cancelable && !inside(e.target, '[data-play-surface]') && !inside(e.target, '[data-hold-control]')) e.preventDefault();
    };
    // preventDefault only: these fire for any second finger on iPhone, so they must never touch input state.
    const gesture = (e: Event) => { if (e.cancelable) e.preventDefault(); };
    // Decided when each event fires: a touch laptop or an iPad driven by its mouse or trackpad keeps the right-click menu and selection.
    const inMain = (e: Event) => { if (touchMode() && inside(e.target, 'main')) e.preventDefault(); };
    const gestures = ['gesturestart', 'gesturechange', 'gestureend'];
    document.addEventListener('touchmove', touchmove, opts);
    for (const type of gestures) document.addEventListener(type, gesture, opts);
    document.addEventListener('contextmenu', inMain, opts); document.addEventListener('selectstart', inMain, opts);
    // Defensive: pinch is blocked in play, but if the page is zoomed anyway, pause so Resume can ask to pinch out.
    const vv = window.visualViewport;
    const zoomed = () => {
      if (!vv || vv.scale <= ZOOMED || !touchMode() || !isPlaying(useGame.getState())) return;
      pause(); useGame.setState({ zoomNote: true });
    };
    vv?.addEventListener('resize', zoomed);
    return () => {
      delete root.dataset.playing;
      document.removeEventListener('touchmove', touchmove, opts);
      for (const type of gestures) document.removeEventListener(type, gesture, opts);
      document.removeEventListener('contextmenu', inMain, opts); document.removeEventListener('selectstart', inMain, opts);
      vv?.removeEventListener('resize', zoomed);
    };
  }, [playing, capable]);

  // Wake lock: given back on pause; asked for again when the page returns while playing (the OS drops it when hidden).
  useEffect(() => { if (paused) releaseWakeLock(); }, [paused]);
  useEffect(() => {
    const visible = () => { if (document.visibilityState === 'visible' && isPlaying(useGame.getState())) requestWakeLock(); };
    document.addEventListener('visibilitychange', visible);
    return () => { document.removeEventListener('visibilitychange', visible); releaseWakeLock(); };
  }, []);

  // A back swipe pops the sentinel: pause and ask "Leave the game?". Never pushState here (keepPlaying and Resume re-arm).
  // With Flight settings or the Field guide open the game is already paused and the card could not show: no prompt, and
  // closing the dialog resumes and puts the sentinel back.
  useEffect(() => {
    if (!started) return;
    const popstate = (e: PopStateEvent) => {
      if (!touchCapable()) return; // a desktop never arms the sentinel, so Back is ordinary navigation there
      const onSentinel = !!(e.state as { halavergaPlay?: unknown } | null)?.halavergaPlay;
      if (onSentinel) { useGame.setState({ leavePrompt: false }); return; }
      const g = useGame.getState();
      if (g.panel || g.journal) return;
      if (!g.paused) pause();
      useGame.setState({ leavePrompt: true });
    };
    window.addEventListener('popstate', popstate);
    return () => window.removeEventListener('popstate', popstate);
  }, [started]);
}
