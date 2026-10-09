import { expect, test } from '@playwright/test';
import { begin, hud } from './shooter-browser';
import { BUDGET } from '../src/world/cannonContract';
// The arm cannon in the real game (system Chrome; emulation is not iPhone validation): loaded and drawn with the right hand hidden
// while the blaster is on, and never requested with it off.
const isCannon = (url: string) => url.includes('/models/arm-cannon.glb');
test('the blaster loads the arm cannon (within its byte budget) and hides the hand; firing keeps it shown', async ({ page }) => {
  const errors: string[] = [], requested: string[] = [], sizes: Promise<number>[] = [];
  page.on('pageerror', e => errors.push(e.message)); page.on('request', r => { if (isCannon(r.url())) requested.push(r.url()); });
  page.on('response', r => { if (isCannon(r.url()) && r.ok()) sizes.push(r.body().then(b => b.length)); });
  await begin(page);
  await expect(hud(page)).toHaveAttribute('data-cannon', 'shown', { timeout: 15000 });
  expect(requested.length).toBeGreaterThan(0);
  // The bold r5 cannon (owner feedback 2026-09-23) is served whole and stays under the contract's byte budget.
  const bytes = await Promise.all(sizes);
  expect(bytes.length).toBeGreaterThan(0); for (const n of bytes) { expect(n).toBeGreaterThan(100000); expect(n).toBeLessThanOrEqual(BUDGET.bytes); }
  await page.keyboard.down('KeyC'); await page.waitForTimeout(400); await page.keyboard.up('KeyC');
  expect(Number(await hud(page).getAttribute('data-shots'))).toBeGreaterThan(0);
  await expect(hud(page)).toHaveAttribute('data-cannon', 'shown');
  expect(errors).toEqual([]);
});
test('with the blaster off the arm cannon is never requested', async ({ page }) => {
  const requested: string[] = [];
  page.on('request', r => { if (isCannon(r.url())) requested.push(r.url()); });
  await begin(page, '/?shooter=0');
  await page.keyboard.press('Space'); await page.waitForTimeout(2500);
  await expect(hud(page)).toHaveCount(0);
  expect(requested).toEqual([]);
});
