import { existsSync } from 'node:fs';
import { expect, test, webkit } from '@playwright/test';

test('desktop WebKit in both phone layouts can steer and tap to intercept', async ({ baseURL }, info) => {
  test.skip(!existsSync(webkit.executablePath()), 'The matching desktop WebKit test browser is not installed.');
  test.setTimeout(90000);
  const browser = await webkit.launch({
    executablePath: webkit.executablePath(),
    args: [],
    headless: process.platform !== 'darwin',
    timeout: 15000,
  });
  try {
    for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
      const context = await browser.newContext({ baseURL, viewport, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
      try {
        const page = await context.newPage(), errors: string[] = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.goto('/crossing');
        await page.getByRole('button', { name: 'Take wing' }).tap();
        await page.keyboard.down('ArrowRight');
        await page.waitForTimeout(1500);
        await page.keyboard.up('ArrowRight');
        await expect(page.locator('main')).toHaveAttribute('data-in-reach', 'true', { timeout: 12000 });
        await page.touchscreen.tap(Math.round(viewport.width * .45), Math.round(viewport.height * .55));
        await expect(page.getByRole('heading', { name: 'The travelers cross.' })).toBeVisible();
        await page.screenshot({ path: info.outputPath(`webkit-${viewport.width}.png`) });
        expect(errors).toEqual([]);
      } finally { await context.close(); }
    }
  } finally { await browser.close(); }
});
