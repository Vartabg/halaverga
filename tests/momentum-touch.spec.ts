import { expect, test } from '@playwright/test';
import { CLASSIC, seed } from './shooter-browser';
for (const viewport of [{ width: 393, height: 852 }, { width: 852, height: 393 }]) {
  test(`phone looks from hover, flies only while held, then settles at ${viewport.width}x${viewport.height}`, async ({ browser }) => {
    const context = await browser.newContext({ viewport, hasTouch: true, isMobile: true });
    try {
      const page = await context.newPage(), errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
      await seed(page, CLASSIC); await page.goto('/'); await page.getByRole('button', { name: 'Ascend Mount Hermon' }).tap();
      const cdp = await context.newCDPSession(page), t = page.getByTestId('flight-telemetry');
      const speed = () => t.getAttribute('data-speed').then(Number), pos = async () => JSON.parse((await t.getAttribute('data-position'))!) as number[];
      const send = (type: 'touchStart' | 'touchMove' | 'touchEnd' | 'touchCancel', points: { id: number; x: number; y: number }[]) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });
      const x = viewport.width * .25, y = viewport.height * .68;
      await send('touchStart', [{ x, y, id: 1 }]); await send('touchMove', [{ x: x + 55, y, id: 1 }]); await page.waitForTimeout(650);
      await expect(t).toHaveAttribute('data-flying', 'false'); expect(await speed()).toBeLessThan(.5);
      await send('touchEnd', []);
      const fly = page.getByRole('button', { name: 'Hold to fly', exact: true }), box = (await fly.boundingBox())!;
      const finger = { id: 1, x: box.x + box.width / 2, y: box.y + box.height / 2 };
      await send('touchStart', [finger]); await page.waitForTimeout(1000);
      await expect(t).toHaveAttribute('data-flying', 'true'); expect(await speed()).toBeGreaterThan(8);
      await send('touchMove', [{ ...finger, y: finger.y - 60 }]); await page.waitForTimeout(350);
      await send('touchEnd', []); await page.waitForTimeout(750); expect(await speed()).toBeLessThan(.5);
      const parked = await pos(), heading = Number(await t.getAttribute('data-heading'));
      await send('touchStart', [{ x, y, id: 1 }]); await send('touchMove', [{ x: x - 60, y, id: 1 }]); await page.waitForTimeout(700);
      expect(Math.abs(Number(await t.getAttribute('data-heading')) - heading)).toBeGreaterThan(.15);
      expect(Math.hypot(...(await pos()).map((n, i) => n - parked[i]))).toBeLessThan(.15);
      await send('touchEnd', []); await page.screenshot({ path: test.info().outputPath('look-from-hover.png') }); expect(errors).toEqual([]);
    } finally { await context.close(); }
  });
}
