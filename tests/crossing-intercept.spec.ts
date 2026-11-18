import { expect, test, type Page } from '@playwright/test';

const reach = (page: Page) => page.locator('main[data-in-reach="true"]');
const won = (page: Page) => page.getByRole('heading', { name: 'The travelers cross.' });

test('a low dive and a fresh sword press turn the Watcher away', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/crossing');
  const start = page.getByRole('button', { name: 'Take wing' });
  await expect(start).toBeEnabled();
  await page.screenshot({ path: info.outputPath('opening.png') });
  await start.click();
  await page.keyboard.down('ArrowLeft');
  await page.keyboard.down('ArrowDown');
  await page.waitForTimeout(1400);
  await page.keyboard.up('ArrowDown');
  await page.keyboard.up('ArrowLeft');
  await expect(reach(page)).toBeVisible({ timeout: 8000 });
  await page.keyboard.press('Space');
  await expect(won(page)).toBeVisible();
  await page.waitForTimeout(1700);
  await page.screenshot({ path: info.outputPath('crossing.png') });
  await page.getByRole('button', { name: 'Fly again' }).click();
  await expect(page.locator('main')).toHaveAttribute('data-phase', 'flight');
  expect(errors).toEqual([]);
});

for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
  test(`one thumb can take the high approach at ${viewport.width}x${viewport.height}`, async ({ browser }, info) => {
    const context = await browser.newContext({ viewport, isMobile: true, hasTouch: true });
    try {
      const page = await context.newPage(), errors: string[] = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.goto('/crossing');
      const start = page.getByRole('button', { name: 'Take wing' });
      await expect(start).toBeEnabled();
      await page.screenshot({ path: info.outputPath('opening.png') });
      await start.tap();
      const cdp = await context.newCDPSession(page);
      const thumb = { x: Math.round(viewport.width * .35), y: Math.round(viewport.height * .62), id: 1 };
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [thumb] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...thumb, x: thumb.x + 75 }] });
      await page.waitForTimeout(1500);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [thumb] });
      await page.screenshot({ path: info.outputPath('high-approach.png') });
      await expect(reach(page)).toBeVisible({ timeout: 10000 });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await expect(won(page)).toBeVisible();
      await page.waitForTimeout(1800);
      await page.screenshot({ path: info.outputPath('crossing.png') });
      expect(errors).toEqual([]);
    } finally {
      await context.close();
    }
  });
}
