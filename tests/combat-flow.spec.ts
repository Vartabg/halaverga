import { expect, test } from '@playwright/test';
import { CLASSIC, seed } from './shooter-browser';
for (const { touch, viewport } of [{ touch: false, viewport: { width: 1440, height: 900 } }, { touch: true, viewport: { width: 852, height: 393 } }, { touch: true, viewport: { width: 393, height: 852 } }]) test(`chain real sword contacts with ${touch ? 'phone taps' : 'keyboard presses'} at ${viewport.width}x${viewport.height} and no ritual gestures`, async ({ browser }) => {
  test.setTimeout(90000);
  const context = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch });
  try {
    const page = await context.newPage(), errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
    await seed(page, CLASSIC); await page.goto('/'); await page.getByRole('button', { name: 'Begin expedition' }).click();
    if (touch) await page.getByRole('button', { name: 'Lift', exact: true }).tap(); else await page.keyboard.press('Space');
    await page.waitForTimeout(600); await page.keyboard.press('KeyB'); await page.keyboard.down('KeyV');
    if (touch) {
      const attack = await page.getByRole('button', { name: 'Strike next demon' }).boundingBox();
      for (const name of ['Land', 'Brake to hover']) {
        const other = await page.getByRole('button', { name, exact: true }).boundingBox();
        expect(attack).not.toBeNull(); expect(other).not.toBeNull();
        const overlap = attack!.x < other!.x + other!.width && attack!.x + attack!.width > other!.x && attack!.y < other!.y + other!.height && attack!.y + attack!.height > other!.y;
        expect(overlap, `Strike must be separate from ${name}`).toBe(false);
      }
    }
    const hud = page.getByTestId('battle-hud'), target = page.getByTestId('combat-target');
    let peak = 0, engaged = false;
    for (let n = 0; n < 100 && peak < 3; n++) {
      if (engaged || await target.locator('i').isVisible()) {
        engaged = true;
        if (touch && n > 0) await page.getByRole('button', { name: 'Strike next demon' }).tap();
        else if (touch) {
          const x = Number(await target.getAttribute('data-x')), y = Number(await target.getAttribute('data-y'));
          await page.touchscreen.tap(x, y);
        } else await page.keyboard.press('KeyC');
      } else {
        const telemetry = page.getByTestId('flight-telemetry'), pitch = Number(await telemetry.getAttribute('data-pitch'));
        const position = JSON.parse((await telemetry.getAttribute('data-position'))!);
        const desired = position[1] > 45 ? -.7 : -.18;
        const vertical = pitch > desired + .1 ? 'ArrowDown' : pitch < desired - .1 ? 'ArrowUp' : null;
        if (vertical) await page.keyboard.down(vertical);
        await page.keyboard.down('ArrowRight'); await page.waitForTimeout(100); await page.keyboard.up('ArrowRight');
        if (vertical) await page.keyboard.up(vertical);
      }
      await page.waitForTimeout(160);
      peak = Math.max(peak, Number(await hud.getAttribute('data-combo')));
    }
    await page.screenshot({ path: test.info().outputPath('chain.png') });
    expect(peak).toBeGreaterThanOrEqual(3);
    await expect.poll(async () => Number(await hud.getAttribute('data-banished')), { timeout: 8000 }).toBeGreaterThanOrEqual(3);
    expect(errors).toEqual([]);
  } finally { await context.close(); }
});
