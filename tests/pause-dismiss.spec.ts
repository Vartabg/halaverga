import { expect, test } from '@playwright/test';
import { labPage } from './lab-browser';
import { paused, playing } from './vote-browser';

// Leaving the pause card without its button (Garo 2026-10-07): a click or tap outside the card resumes, and Escape toggles pause and
// resume. Both go through the same entry as Resume. System Chrome emulation.
test('a click outside the pause card resumes, and Escape pauses then resumes', async ({ browser }) => {
  const t = await labPage(browser, 'standard', { viewport: { width: 1440, height: 1000 } }), { page } = t;
  await playing(page).click();
  await expect(paused(page)).toBeVisible();
  await page.getByTestId('pause-scrim').click({ position: { x: 40, y: 500 } });
  await expect(playing(page)).toBeVisible(); await expect(paused(page)).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(paused(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(playing(page)).toBeVisible(); await expect(paused(page)).toHaveCount(0);
  expect(t.errors).toEqual([]); await t.context.close();
});

test('on a phone a tap outside the card resumes and the tap never reaches the flight surface', async ({ browser }) => {
  const t = await labPage(browser, 'standard', { touch: true, viewport: { width: 844, height: 390 } }), { page, finger } = t;
  await playing(page).tap();
  await expect(paused(page)).toBeVisible();
  await finger.down({ x: 60, y: 330 }); await finger.up();
  await expect(playing(page)).toBeVisible(); await expect(paused(page)).toHaveCount(0);
  expect(t.errors).toEqual([]); await t.context.close();
});
