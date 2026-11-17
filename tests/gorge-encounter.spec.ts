import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { CLASSIC, seed } from './shooter-browser';
import { flyTo } from './flight-support';
for (const viewport of [{ width: 393, height: 852 }, { width: 852, height: 393 }]) {
  test(`fly the length of the gorge under fire and stop to look ${viewport.width}x${viewport.height}`, async ({ browser }) => {
    test.setTimeout(100000);
    const context = await browser.newContext({ viewport, isMobile: true, hasTouch: true });
    try {
      const page = await context.newPage(), errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
      await seed(page, CLASSIC); await page.goto('/'); await page.getByRole('button', { name: 'Ascend Mount Hermon' }).tap();
      await page.getByRole('button', { name: 'Lift', exact: true }).tap(); await page.keyboard.down('KeyV');
      // Out over the water, down the west bank past the summit terrace, then up level with its top: real flight over real terrain.
      await flyTo(page, [0, 32, 25]); await flyTo(page, [-22, 30, -30]);
      await page.screenshot({ path: test.info().outputPath('gorge-mid.png') });
      await flyTo(page, [-12, 40, -95]); await flyTo(page, [0, 66, -70]);
      const t = page.getByTestId('flight-telemetry'), before = JSON.parse((await t.getAttribute('data-position'))!) as number[];
      const cdp = await context.newCDPSession(page), p = { id: 1, x: viewport.width * .42, y: viewport.height * .52 };
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [p] });
      for (let n = 1; n <= 5; n++) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...p, x: p.x + n * 12 }] });
        await page.waitForTimeout(50);
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await page.waitForTimeout(400);
      const after = JSON.parse((await t.getAttribute('data-position'))!) as number[];
      expect(Math.hypot(...after.map((v, i) => v - before[i]))).toBeLessThan(.35);
      expect(Number(await t.getAttribute('data-speed'))).toBeLessThan(.5);
      await page.screenshot({ path: test.info().outputPath('gorge-hover.png') });
      const aa = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze(); expect(aa.violations).toEqual([]);
      expect(errors).toEqual([]);
    } finally { await context.close(); }
  });
}
