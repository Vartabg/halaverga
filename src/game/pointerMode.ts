// Touch-vs-desktop decision (landing-safe, no React, no three). The last pointer that touched the page decides, so an iPad with a
// trackpad is desktop while the trackpad drives and touch the moment a finger lands. Callers read touchMode() when each event fires.
// A device that has never shown any touch ability (a Mac with a trackpad or mouse: maxTouchPoints 0, fine pointer) is never
// touch, whatever pointerType a synthetic or pen event reports: touchCapable() gates every touch-only layer and browser guard.
type Mode = 'touch' | 'mouse';
type Query = { matches: boolean; addEventListener?: (type: 'change', fn: () => void) => void; removeEventListener?: (type: 'change', fn: () => void) => void };
let noted: Mode | null = null, touchSeen = false;

/**
 * The coarse-pointer media query. touchMode() runs every physics step and frame, so the MediaQueryList is created once and its
 * live `matches` read after that. False when matchMedia is missing.
 */
let query: Query | null | undefined;
function coarse(): boolean {
  if (query === undefined) {
    try { query = typeof matchMedia === 'function' ? matchMedia('(pointer: coarse)') : null; }
    catch { query = null; }
  }
  return !!query?.matches;
}
const touchPoints = () => (typeof navigator !== 'undefined' && (navigator.maxTouchPoints ?? 0) > 0);

/** True once this device has shown it can touch: a touch pointer seen, touch points reported, or a coarse primary pointer. Live. */
export function touchCapable(): boolean { return touchSeen || touchPoints() || coarse(); }

const listeners = new Set<() => void>();
let watched: Query | null = null, lastCapable: boolean | null = null;
/** Calls the listeners only when touchCapable() actually flipped since the last notice. */
function emit() {
  const now = touchCapable();
  if (now === lastCapable) return;
  lastCapable = now;
  for (const fn of [...listeners]) fn();
}
/** Subscribe to touchCapable() flips (a first touch, or the coarse query changing). Returns the unsubscribe. */
export function onTouchCapable(fn: () => void): () => void {
  listeners.add(fn);
  if (lastCapable === null) lastCapable = touchCapable(); else coarse();
  if (!watched && query?.addEventListener) { watched = query; query.addEventListener('change', emit); }
  return () => {
    listeners.delete(fn);
    if (listeners.size || !watched) return;
    watched.removeEventListener?.('change', emit); watched = null; lastCapable = null;
  };
}

/**
 * 'touch' latches touch capability and means touch mode. 'pen' means touch only on a touch-capable device, otherwise mouse.
 * 'mouse' means mouse mode; anything else is ignored. Returns true when the effective mode changed.
 */
export function notePointer(pointerType: string): boolean {
  if (pointerType !== 'touch' && pointerType !== 'pen' && pointerType !== 'mouse') return false;
  const before = touchMode();
  if (pointerType === 'touch' && !touchSeen) { touchSeen = true; if (listeners.size) emit(); }
  noted = pointerType === 'touch' || (pointerType === 'pen' && touchCapable()) ? 'touch' : 'mouse';
  return before !== touchMode();
}

/** True on a touch-capable device when the last pointer was touch (or pen). Before any pointer, falls back to `(pointer: coarse)`. */
export function touchMode(): boolean {
  return touchCapable() && (noted === null ? coarse() : noted === 'touch');
}

/** Tests only: forget the noted pointer, the touch latch, the listeners and the cached media query. */
export function resetPointerMode(): void {
  watched?.removeEventListener?.('change', emit);
  noted = null; touchSeen = false; query = undefined; watched = null; lastCapable = null; listeners.clear();
}
