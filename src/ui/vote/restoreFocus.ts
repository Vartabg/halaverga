// Where keyboard focus goes when the vote card closes (V5, WCAG 2.4.3 Focus Order). The card removes the element that had focus (or the
// page behind it was inert), so without this focus falls to <main>. Pure apart from the small `Pickable` view of an element, so a test
// can drive it without a DOM.
export interface Pickable { isConnected: boolean; closest(selector: string): unknown }
export interface FocusPlan<T extends Pickable> {
  /** The element that had focus when the card opened (null when it was the page itself). */
  opener: T | null;
  /** The game runs again on a keyboard family: focus goes back to the flight surface, as the Controls sheet does on close. */
  flying: boolean;
  surface: () => T | null;
  /** In order: the pause card's vote door, the header chip, the Controls trigger. */
  doors: (() => T | null)[];
}

/** The element to focus, or null when there is none (then nothing is focused and the page keeps its own default). */
export function pickFocus<T extends Pickable>(p: FocusPlan<T>): T | null {
  if (p.flying) { const s = p.surface(); if (s) return s; }
  if (p.opener && p.opener.isConnected && !p.opener.closest('[inert]')) return p.opener;
  for (const door of p.doors) { const e = door(); if (e) return e; }
  return null;
}

const DOORS = ['[data-testid="vote-open"]', '[data-testid="vote-chip"]', '[data-testid="controls-trigger"]'];
/** The plan for the live page. `opener` is document.activeElement at open time, ignored when it was only body or html. */
export function livePlan(opener: Element | null, flying: boolean): FocusPlan<HTMLElement> {
  const q = (sel: string) => document.querySelector<HTMLElement>(sel);
  const real = opener instanceof HTMLElement && opener !== document.body && opener !== document.documentElement ? opener : null;
  return { opener: real, flying, surface: () => document.getElementById('expedition'), doors: DOORS.map(sel => () => q(sel)) };
}
