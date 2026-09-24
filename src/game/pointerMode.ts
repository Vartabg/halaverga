// Touch-vs-desktop decision (landing-safe, no React, no three). The last pointer that touched the page decides, so an iPad with a
// trackpad is desktop while the trackpad drives and touch the moment a finger lands. Callers read touchMode() when each event fires.
type Mode = 'touch' | 'mouse';
let noted: Mode | null = null;

/**
 * The coarse-pointer media query, used only until the first pointer event arrives. touchMode() runs every physics step and
 * frame, so the MediaQueryList is created once and its live `matches` read after that. False when matchMedia is missing.
 */
let query: { matches: boolean } | null | undefined;
function coarse(): boolean {
  if (query === undefined) {
    try { query = typeof matchMedia === 'function' ? matchMedia('(pointer: coarse)') : null; }
    catch { query = null; }
  }
  return !!query?.matches;
}

/** 'touch' and 'pen' mean touch mode; 'mouse' means mouse mode; anything else is ignored. Returns true when the effective mode changed. */
export function notePointer(pointerType: string): boolean {
  const next: Mode | null = pointerType === 'touch' || pointerType === 'pen' ? 'touch' : pointerType === 'mouse' ? 'mouse' : null;
  if (!next) return false;
  const before = touchMode();
  noted = next;
  return before !== (next === 'touch');
}

/** True when the last pointer was touch or pen. Before any pointer, falls back to `(pointer: coarse)`. */
export function touchMode(): boolean {
  return noted === null ? coarse() : noted === 'touch';
}

/** Tests only: forget the noted pointer and the cached media query, so the fallback asks matchMedia again. */
export function resetPointerMode(): void { noted = null; query = undefined; }
