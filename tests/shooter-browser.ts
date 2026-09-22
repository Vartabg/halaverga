import { expect, type Browser, type Page } from '@playwright/test';
import { heading, speed, telemetry } from './flow-browser';
export { heading, speed, telemetry };
// Shared helpers for the suit-blaster browser specs. Telemetry (data-heading, data-speed) comes from flow-browser.
export const hud = (p: Page) => p.getByTestId('shooter-hud');
export const reticle = (p: Page) => p.locator('[class*="reticle"]');
export const shots = async (p: Page) => Number(await hud(p).getAttribute('data-shots'));
export const fov = async (p: Page) => Number(await hud(p).getAttribute('data-fov'));
export const aiming = (p: Page) => hud(p).getAttribute('data-aiming');
export const seed = (p: Page, saved: Record<string, unknown>) =>
  p.addInitScript(s => localStorage.setItem('halaverga-flight-v1', JSON.stringify(s)), saved);
export async function begin(page: Page, url = '/') {
  await page.goto(url); await page.getByRole('button', { name: 'Begin expedition' }).click();
  await expect(page.getByRole('button', { name: 'Pause expedition' })).toBeVisible();
}
export async function resume(page: Page) {
  await page.getByRole('button', { name: 'Resume flight' }).click();
  await expect(page.getByRole('button', { name: 'Pause expedition' })).toBeVisible();
}
export type Touch = { id: number; x: number; y: number };
export async function touchPage(browser: Browser, viewport: { width: number; height: number }, saved?: Record<string, unknown>) {
  const context = await browser.newContext({ viewport, isMobile: true, hasTouch: true });
  const page = await context.newPage(), errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  if (saved) await seed(page, saved);
  await page.goto('/'); await page.getByRole('button', { name: 'Begin expedition' }).tap();
  const cdp = await context.newCDPSession(page), fire = page.getByTestId('fire-button');
  await expect(fire).toBeVisible();
  const box = (await fire.boundingBox())!;
  const send = (type: 'touchStart' | 'touchMove' | 'touchEnd' | 'touchCancel', points: Touch[]) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(p => ({ ...p })) });
  // A flight-thumb spot clear of every control: the lower-left quarter of the scene.
  const thumb: Touch = { id: 1, x: Math.round(viewport.width * .25), y: Math.round(viewport.height * .7) };
  const trigger: Touch = { id: 2, x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };
  return { context, page, cdp, send, fire, box, thumb, trigger, errors, surface: page.getByTestId('flight-surface') };
}
