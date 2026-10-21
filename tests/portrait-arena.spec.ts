import { expect, test } from '@playwright/test';
import { CLASSIC, seed } from './shooter-browser';
for (const viewport of [{ width: 393, height: 852 }, { width: 852, height: 393 }]) test(`warden instructions leave portrait/landscape controls readable at ${viewport.width}x${viewport.height}`, async ({ browser }) => {
  test.setTimeout(90000);
  const context = await browser.newContext({ viewport, hasTouch: true, isMobile: true });
  try {
    const page = await context.newPage(), errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
    await seed(page, CLASSIC); await page.goto('/'); await page.getByRole('button', { name: 'Begin expedition' }).tap();
    await page.getByRole('button', { name: 'Lift', exact: true }).tap(); await page.waitForTimeout(500); await page.keyboard.press('KeyB');
    const telemetry = page.getByTestId('flight-telemetry');
    for (let n = 0; n < 45; n++) {
      const p = JSON.parse((await telemetry.getAttribute('data-position'))!), yaw = Number(await telemetry.getAttribute('data-heading')), pitch = Number(await telemetry.getAttribute('data-pitch'));
      const x = -p[0], y = 36 - p[1], z = -55 - p[2], d = Math.hypot(x, y, z);
      if (d < 40) break;
      const dy = Math.atan2(Math.sin(Math.atan2(-x, -z) - yaw), Math.cos(Math.atan2(-x, -z) - yaw));
      const dp = Math.atan2(y, Math.hypot(x, z)) - pitch;
      const horizontal = Math.abs(dy) > .08 ? dy > 0 ? 'ArrowLeft' : 'ArrowRight' : null;
      const vertical = Math.abs(dp) > .08 ? dp > 0 ? 'ArrowUp' : 'ArrowDown' : null;
      if (horizontal) await page.keyboard.down(horizontal); if (vertical) await page.keyboard.down(vertical);
      if (Math.abs(dy) + Math.abs(dp) < .35) await page.keyboard.down('KeyW');
      await page.waitForTimeout(160);
      if (horizontal) await page.keyboard.up(horizontal); if (vertical) await page.keyboard.up(vertical); await page.keyboard.up('KeyW');
    }
    await page.keyboard.press('KeyB'); await page.keyboard.down('KeyV');
    const elite = page.getByTestId('elite-hud');
    await expect(elite).toBeVisible();
    const box = await elite.boundingBox(); expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
    expect(await elite.evaluate(el => getComputedStyle(el).pointerEvents)).toBe('none');
    for (const name of ['Pause expedition', 'Hold to fly', 'Brake to hover', 'Land', 'Strike next demon']) {
      const control = await page.getByRole('button', { name, exact: true }).boundingBox(); expect(control).not.toBeNull();
      const overlap = box!.x < control!.x + control!.width && box!.x + box!.width > control!.x && box!.y < control!.y + control!.height && box!.y + box!.height > control!.y;
      expect(overlap, `Warden instructions must leave ${name} readable`).toBe(false);
    }
    await page.screenshot({ path: test.info().outputPath('arena-hud.png') });
    expect(errors).toEqual([]);
  } finally { await context.close(); }
});
