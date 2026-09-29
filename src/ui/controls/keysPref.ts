// The "Number keys 1-8 switch controls" preference (WCAG 2.1.4: a single-character shortcut needs a way to turn it off). On by default;
// a plain 'off' under its own localStorage key. Every access is wrapped: with storage blocked the choice still holds for this page.
import { useSyncExternalStore } from 'react';

export const KEYS_PREF_KEY = 'halaverga.controls.keys.v1';
let memory: boolean | null = null;
const listeners = new Set<() => void>();

/** Read at keypress time. Default on; only a stored 'off' (or this page's own off, when storage refuses) turns the digits off. */
export function keysEnabled(): boolean {
  try { const v = localStorage.getItem(KEYS_PREF_KEY); if (v !== null) return v !== 'off'; } catch { /* blocked storage: use the page's own choice */ }
  return memory ?? true;
}
export function setKeysEnabled(on: boolean) {
  memory = on;
  try { localStorage.setItem(KEYS_PREF_KEY, on ? 'on' : 'off'); } catch { /* the page keeps the choice in memory */ }
  for (const fn of [...listeners]) fn();
}
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
/** [enabled, set]: every checkbox on the page follows the same value. */
export function useKeysPref(): [boolean, (on: boolean) => void] {
  return [useSyncExternalStore(subscribe, keysEnabled, () => true), setKeysEnabled];
}
