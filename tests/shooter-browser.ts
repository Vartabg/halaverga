import { expect, type Browser, type Page } from '@playwright/test';
import { heading, speed, telemetry } from './flow-browser';
export { heading, speed, telemetry };
// Shared helpers for the suit-blaster browser specs. Telemetry (data-heading, data-speed) comes from flow-browser.
export const hud = (p: Page) => p.getByTestId('shooter-hud');
export const reticle = (p: Page) => p.locator('[class*="reticle"]');
export const shots = async (p: Page) => Number(await hud(p).getAttribute('data-shots'));
export const fov = async (p: Page) => Number(await hud(p).getAttribute('data-fov'));
export const aiming = (p: Page) => hud(p).getAttribute('data-aiming');
// Seeds the save once per tab: a reload keeps what the app itself saved since (settings changed in the test persist).
export const seed = (p: Page, saved: Record<string, unknown>) =>
  p.addInitScript(s => {
    if (!sessionStorage.getItem('halaverga-seeded')) { sessionStorage.setItem('halaverga-seeded', '1'); localStorage.setItem('halaverga-flight-v1', JSON.stringify(s)); }
  }, saved);
export async function begin(page: Page, url = '/') {
  await page.goto(url); await page.getByRole('button', { name: 'Begin expedition' }).click();
  await expect(page.getByRole('button', { name: 'Pause expedition' })).toBeVisible();
}
export async function resume(page: Page) {
  await page.getByRole('button', { name: 'Resume flight' }).click();
  await expect(page.getByRole('button', { name: 'Pause expedition' })).toBeVisible();
}
export type Touch = { id: number; x: number; y: number };
type Viewport = { width: number; height: number };
/** A touch page after Begin, seeded only when `saved` is given (fresh storage otherwise: auto-fire on, no Fire button). `init` runs
 * before the app's scripts (an instrumentation hook). */
export async function autoTouchPage(browser: Browser, viewport: Viewport, saved?: Record<string, unknown>, url = '/', init?: () => void) {
  const context = await browser.newContext({ viewport, isMobile: true, hasTouch: true });
  const page = await context.newPage(), errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  if (saved) await seed(page, saved);
  if (init) await page.addInitScript(init);
  await page.goto(url); await page.getByRole('button', { name: 'Begin expedition' }).tap();
  await expect(page.getByRole('button', { name: 'Pause expedition' })).toBeVisible();
  const cdp = await context.newCDPSession(page);
  const send = (type: 'touchStart' | 'touchMove' | 'touchEnd' | 'touchCancel', points: Touch[]) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(p => ({ ...p })) });
  // A flight-thumb spot clear of every control: the lower-left quarter of the scene.
  const thumb: Touch = { id: 1, x: Math.round(viewport.width * .25), y: Math.round(viewport.height * .7) };
  return { context, page, cdp, send, thumb, errors, surface: page.getByTestId('flight-surface') };
}
/** The Fire/Aim specs: auto-fire off and the Aim button on, so every existing Fire and Aim check keeps its controls. */
export async function touchPage(browser: Browser, viewport: Viewport, saved?: Record<string, unknown>, init?: () => void) {
  const t = await autoTouchPage(browser, viewport, { autoFire: false, aimButton: true, ...saved }, '/', init), fire = t.page.getByTestId('fire-button');
  await expect(fire).toBeVisible();
  const box = (await fire.boundingBox())!;
  const trigger: Touch = { id: 2, x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };
  return { ...t, fire, box, trigger };
}
