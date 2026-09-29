// Lazy-only, pure: which control family (touch or desktop) the player is using right now. The last pointer that touched the page
// decides, so a touch laptop follows whichever pointer came last. The sheet, the settings section, the digit keys and the vote
// layer all read this one module.
import type { ControlFamily } from '@/game/controlTypes';
import { touchCapable, touchMode } from '@/game/pointerMode';

/** touch pointer on a touch-capable device -> touch; mouse -> desktop; pen, unknown (and touch on a device that cannot touch) -> unchanged. */
export function familyOf(pointerType: string, prev: ControlFamily): ControlFamily {
  if (pointerType === 'touch') return touchCapable() ? 'touch' : prev;
  return pointerType === 'mouse' ? 'desktop' : prev;
}

let current: ControlFamily | null = null, watching = false;
const listeners = new Set<(family: ControlFamily) => void>();
/** Before any pointer event: touchMode() (a touch-capable device whose last or primary pointer is touch). Afterwards: the last event. */
export const currentFamily = (): ControlFamily => current ?? (touchMode() ? 'touch' : 'desktop');
/** Subscribe to family changes. Returns the unsubscribe. */
export function onFamily(fn: (family: ControlFamily) => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
/** Installs ONE window pointerdown capture listener (idempotent). It reads the event's own pointerType, so listener order does not matter. */
export function watchFamily() {
  if (watching || typeof window === 'undefined') return;
  watching = true;
  window.addEventListener('pointerdown', e => {
    const before = currentFamily(), next = familyOf(e.pointerType, before);
    current = next;
    if (next !== before) for (const fn of [...listeners]) fn(next);
  }, true);
}
/** Tests only: forget the noted family and let watchFamily install again. */
export function resetFamily() { current = null; watching = false; listeners.clear(); }
