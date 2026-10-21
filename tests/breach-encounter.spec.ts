import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { CLASSIC, seed } from './shooter-browser';
import { flyTo } from './breach-support';
for (const viewport of [{ width: 393, height: 852 }, { width: 852, height: 393 }]) {
  test(`fly the useful low and high routes and stop to look ${viewport.width}x${viewport.height}`, async ({ browser }) => {
    test.setTimeout(100000);
    const context = await browser.newContext({ viewport, isMobile: true, hasTouch: true });
    try {
      const page = await context.newPage(), errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
      await seed(page, CLASSIC); await page.goto('/'); await page.getByRole('button', { name: 'Begin expedition' }).tap();
      await page.getByRole('button', { name: 'Lift', exact: true }).tap(); await page.keyboard.down('KeyV');
      await flyTo(page, [-49, 35, 25]); await flyTo(page, [-49, 15, 12], 4);
      await expect(page.getByTestId('breach-route')).toHaveAttribute('data-route', 'low');
      await flyTo(page, [-49, 15, -57]);
      await page.screenshot({ path: test.info().outputPath('low-cover.png') });
      await expect(page.getByTestId('battle-hud')).toHaveAttribute('data-ward', '3');
      await flyTo(page, [-49, 15, -106]); await flyTo(page, [-49, 43, -110]);
      await flyTo(page, [43, 70, -68]); await flyTo(page, [43, 70, -28]);
      await expect(page.getByTestId('breach-route')).toHaveAttribute('data-route', 'high');
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
      await page.screenshot({ path: test.info().outputPath('high-hover.png') });
      const aa = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze(); expect(aa.violations).toEqual([]);
      expect(errors).toEqual([]);
    } finally { await context.close(); }
  });
}
