// Play-session browser helpers: wake lock, the back-swipe history sentinel and the zoom check at Begin/Resume.
// On the landing first load: no three.js and no blaster markers.
import { touchMode } from '@/game/pointerMode';
import { persistGame, useGame } from '@/game/store';

type Sentinel = { released?: boolean; release: () => Promise<void>; addEventListener?: (type: 'release', fn: () => void) => void };
type WakeLockApi = { request: (type: 'screen') => Promise<Sentinel> };
let sentinel: Sentinel | null = null, wantLock = false, pending = false;

/** A Home Screen web app (iOS 26 opens those full screen) or an installed PWA. */
export const isStandalone = () => {
  try { if (typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches) return true; } catch { /* no media queries */ }
  return typeof navigator !== 'undefined' && (navigator as Navigator & { standalone?: boolean }).standalone === true;
};

/** Keep the screen awake while playing (a cruise with no touches would otherwise auto-lock). Missing API or refusal: no-op. */
export function requestWakeLock() {
  wantLock = true;
  if (pending || (sentinel && !sentinel.released)) return;
  const api = typeof navigator !== 'undefined' ? (navigator as Navigator & { wakeLock?: WakeLockApi }).wakeLock : undefined;
  if (!api?.request) return;
  pending = true;
  try {
    api.request('screen').then(lock => {
      pending = false;
      // Paused while the request was in flight: give the lock straight back.
      if (!wantLock) { lock.release().catch(() => {}); return; }
      sentinel = lock;
      lock.addEventListener?.('release', () => { if (sentinel === lock) sentinel = null; });
    }, () => { pending = false; });
  } catch { pending = false; }
}
export function releaseWakeLock() {
  wantLock = false;
  const lock = sentinel; sentinel = null;
  if (lock && !lock.released) { try { lock.release().catch(() => {}); } catch { /* already gone */ } }
}

const armed = () => { const s = history.state as { halavergaPlay?: unknown } | null; return !!s?.halavergaPlay; };
/**
 * Is there anything a back swipe could leave to? An earlier entry in this tab, or a referring page (a tab opened from a link,
 * which Safari's back swipe may close). A fresh tab from a QR code or Messages has neither: there the swipe is already a
 * no-op, and a sentinel would only turn it into an unwanted pause.
 */
export function canGoBack(): boolean {
  if (typeof history === 'undefined') return false;
  return history.length > 1 || (typeof document !== 'undefined' && document.referrer !== '');
}
/**
 * Touch only: one same-URL history entry, so an iOS edge back swipe pops it (and asks "Leave the game?") instead of
 * leaving the page. Never more than one: nothing is pushed while the current entry is already the sentinel, or when a
 * back swipe has nowhere to go.
 */
export function armHistoryGuard() {
  if (typeof history === 'undefined' || !touchMode() || armed() || !canGoBack()) return;
  try { history.pushState({ halavergaPlay: 1 }, ''); } catch { /* history unavailable (sandboxed frame) */ }
}

let restoring: string | null = null;
const nextFrame = (fn: () => void) => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(() => fn()) : setTimeout(fn, 16));
/**
 * Try to undo a pinch zoom: cap the viewport at scale 1 for two frames, then restore the exact original content (so page
 * zoom stays available for reading). Whether iOS Safari honours this is UNVERIFIED on device; the zoom note is the fallback.
 */
export function resetZoom() {
  if (typeof document === 'undefined' || restoring !== null) return;
  const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  if (!meta) return;
  const original = meta.getAttribute('content') ?? '';
  restoring = original;
  meta.setAttribute('content', `${original}, maximum-scale=1`);
  nextFrame(() => nextFrame(() => { meta.setAttribute('content', original); restoring = null; }));
}

/**
 * Runs synchronously inside the Begin and Resume clicks (a user gesture, which the wake lock needs). Returns false, and
 * does not start, while the page is pinch-zoomed: play blocks pinch, so a zoomed start would trap the player.
 */
export function onPlayGesture(): boolean {
  const scale = typeof visualViewport !== 'undefined' && visualViewport ? visualViewport.scale : 1;
  if (scale > 1.01) { resetZoom(); useGame.setState({ zoomNote: true }); return false; }
  if (typeof window !== 'undefined' && (window.scrollX || window.scrollY)) window.scrollTo(0, 0);
  requestWakeLock(); armHistoryGuard();
  useGame.setState({ zoomNote: false });
  return true;
}

/** "Keep playing" on the Leave card: put the sentinel back, then the caller resumes. */
export function keepPlaying() {
  armHistoryGuard();
  useGame.setState({ leavePrompt: false });
}

/** "Leave" on the Leave card: save, then go back past the page. If nothing happened after 400 ms, stay here, paused. */
export function leaveGame() {
  persistGame();
  useGame.setState({ leavePrompt: false });
  history.back();
  setTimeout(() => {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') useGame.setState({ leavePrompt: false, paused: true });
  }, 400);
}
