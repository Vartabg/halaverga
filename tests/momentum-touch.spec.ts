import { expect, test } from '@playwright/test';
import { CLASSIC, seed } from './shooter-browser';
for (const viewport of [{ width: 393, height: 852 }, { width: 852, height: 393 }]) {
  test(`touch release glides and deliberate Brake hovers at ${viewport.width}x${viewport.height}`, async ({ browser }) => {
    const context = await browser.newContext({ viewport, hasTouch: true, isMobile: true });
    try {
      const page = await context.newPage(), errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
      await seed(page, CLASSIC); await page.goto('/'); await page.getByRole('button', { name: 'Begin expedition' }).tap();
      await page.getByRole('button', { name: 'Lift', exact: true }).tap(); await page.waitForTimeout(500);
      const cdp = await context.newCDPSession(page), speed = () => page.getByTestId('flight-telemetry').getAttribute('data-speed').then(Number);
      const x = viewport.width * .25, y = viewport.height * .68;
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + 70, y, id: 1 }] });
      await page.waitForTimeout(750); const before = await speed(); expect(before).toBeGreaterThan(3);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await page.waitForTimeout(300);
      expect(await speed()).toBeGreaterThan(before * .55);
      await page.screenshot({ path: test.info().outputPath('glide.png') });
      await page.getByRole('button', { name: 'Brake to hover' }).tap(); await expect.poll(speed).toBeLessThan(.5);
      await page.screenshot({ path: test.info().outputPath('hover.png') });
      expect(errors).toEqual([]);
    } finally { await context.close(); }
  });
}
