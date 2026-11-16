// Shared helpers for simple-hints.spec.ts (split out to keep the spec under the 200-line module rule).
import type { Page } from '@playwright/test';
export const hint = (p: Page) => p.getByTestId('controls-hint');
export const soundNotice = (p: Page) => p.locator('p', { hasText: 'Blaster sound is off · Pause, then Flight settings' });
export const locked = (p: Page) => p.evaluate(() => !!document.pointerLockElement);
export const saved = (p: Page) => p.evaluate(() => JSON.parse(localStorage.getItem('halaverga-flight-v1') || '{}').hintProgress);
export const errorsOf = (p: Page) => { const errors: string[] = []; p.on('pageerror', e => errors.push(e.message)); return errors; };
// Every text the screen-reader region received, in order (recorded from the first paint, so none is missed between polls).
export const recordSaid = (p: Page) => p.addInitScript(() => {
  const said: string[] = []; (window as unknown as { said: string[] }).said = said;
  new MutationObserver(() => {
    const t = document.querySelector('[data-testid=hint-live]')?.textContent ?? '';
    if (t && said[said.length - 1] !== t) said.push(t);
  }).observe(document, { subtree: true, childList: true, characterData: true });
});
export const said = (p: Page) => p.evaluate(() => (window as unknown as { said: string[] }).said);
export const overlaps = (a: { x: number; y: number; width: number; height: number }, b: typeof a) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
