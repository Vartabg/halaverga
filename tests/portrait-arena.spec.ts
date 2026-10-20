import { expect, test } from '@playwright/test';
import { CLASSIC, seed } from './shooter-browser';
for (const viewport of [{ width: 393, height: 852 }, { width: 852, height: 393 }]) test(`warden armor, response and banishment at ${viewport.width}x${viewport.height}`, async ({ browser }) => {
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
    const elite = page.getByTestId('elite-hud'), hud = page.getByTestId('battle-hud');
    await expect(elite).toBeVisible();
    const tap = async () => {
      for (let n = 0; n < 24; n++) {
        const x = Number(await elite.getAttribute('data-x')), y = Number(await elite.getAttribute('data-y'));
        if (x > viewport.width * .3 && x < viewport.width * .7 && y > viewport.height * .3 && y < viewport.height * .65) break;
        const h = x < viewport.width * .3 ? 'ArrowLeft' : x > viewport.width * .7 ? 'ArrowRight' : null;
        const v = y < viewport.height * .3 ? 'ArrowUp' : y > viewport.height * .65 ? 'ArrowDown' : null;
        if (h) await page.keyboard.down(h); if (v) await page.keyboard.down(v); await page.waitForTimeout(80);
        if (h) await page.keyboard.up(h); if (v) await page.keyboard.up(v);
      }
      const x = Number(await elite.getAttribute('data-x')), y = Number(await elite.getAttribute('data-y'));
      expect(x).toBeGreaterThan(20); expect(x).toBeLessThan(viewport.width - 20);
      expect(y).toBeGreaterThan(85); expect(y).toBeLessThan(viewport.height - 85);
      await page.touchscreen.tap(x, y);
    };
    const start = Date.now(), initialKills = Number(await hud.getAttribute('data-banished'));
    await tap(); await expect(elite).toHaveAttribute('data-armor', '1'); await expect(elite).toHaveAttribute('data-recovering', 'true');
    await page.screenshot({ path: test.info().outputPath('warden-armor.png') });
    for (let n = 0; n < 3; n++) await tap();
    await expect(elite).toHaveAttribute('data-armor', '1');
    await expect(elite).toHaveAttribute('data-recovering', 'false', { timeout: 5000 });
    await tap(); await expect(elite).toHaveAttribute('data-armor', '0');
    await expect(elite).toHaveAttribute('data-recovering', 'false', { timeout: 5000 });
    await tap(); await expect(elite).toHaveAttribute('data-mode', '3');
    const target = Number(await elite.getAttribute('data-target')), cue = page.getByTestId('combat-target');
    await expect.poll(async () => JSON.parse((await cue.getAttribute('data-camera'))!).finisher).toBe(target);
    await expect.poll(async () => Number(await telemetry.getAttribute('data-speed'))).toBeLessThan(2);
    await page.screenshot({ path: test.info().outputPath('warden-bound.png') });
    await expect(elite).toHaveAttribute('data-mode', '4');
    await page.waitForTimeout(500);
    const focus = JSON.parse((await cue.getAttribute('data-camera'))!);
    expect(focus.finisher).toBe(target); expect(Math.abs(focus.targetX)).toBeLessThan(.95); expect(Math.abs(focus.targetY)).toBeLessThan(.95);
    await page.screenshot({ path: test.info().outputPath('warden-cast.png') });
    await expect.poll(async () => Number(await hud.getAttribute('data-banished'))).toBeGreaterThan(initialKills);
    expect(Date.now() - start).toBeGreaterThan(4000);
    await page.screenshot({ path: test.info().outputPath('arena-after.png') });
    expect(errors).toEqual([]);
  } finally { await context.close(); }
});
