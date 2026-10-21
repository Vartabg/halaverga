import { expect, test } from '@playwright/test';
import { CLASSIC, seed } from './shooter-browser';
for (const viewport of [{ width: 393, height: 852 }, { width: 852, height: 393 }]) {
  test(`held phone flight releases on interruption at ${viewport.width}x${viewport.height}`, async ({ browser }) => {
    const context = await browser.newContext({ viewport, isMobile: true, hasTouch: true });
    try {
      const page = await context.newPage(); await seed(page, CLASSIC); await page.goto('/'); await page.getByRole('button', { name: 'Begin expedition' }).tap();
      const cdp = await context.newCDPSession(page), t = page.getByTestId('flight-telemetry');
      const speed = () => t.getAttribute('data-speed').then(Number);
      const send = (type: 'touchStart' | 'touchMove' | 'touchEnd' | 'touchCancel', touchPoints: { id: number; x: number; y: number }[]) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints });
      const hold = async () => { const b = (await page.getByRole('button', { name: 'Hold to fly', exact: true }).boundingBox())!;
        const p = { id: 1, x: b.x + b.width / 2, y: b.y + b.height / 2 }; await send('touchStart', [p]); await page.waitForTimeout(900); expect(await speed()).toBeGreaterThan(6); return p; };
      await hold(); await send('touchCancel', []); await expect.poll(speed, { timeout: 1500 }).toBeLessThan(.5);
      await hold(); await page.setViewportSize({ width: viewport.height, height: viewport.width });
      await expect.poll(speed, { timeout: 1500 }).toBeLessThan(.5); await send('touchCancel', []);
      await page.getByRole('button', { name: 'Pause expedition' }).tap(); await page.getByRole('button', { name: 'Resume flight' }).tap();
      await page.waitForTimeout(600); expect(await speed()).toBeLessThan(.5);
      // Native keyboard/assistive activation is a bounded pulse, never a latched cruise.
      await page.getByRole('button', { name: 'Hold to fly', exact: true }).focus(); await page.keyboard.press('Enter');
      await page.waitForTimeout(1100); expect(await speed()).toBeLessThan(.5);
      await page.screenshot({ path: test.info().outputPath('interrupted-hover.png') });
    } finally { await context.close(); }
  });
}
for (const viewport of [{ width: 393, height: 852 }, { width: 852, height: 393 }]) {
  test(`a second finger selects a demon while Fly stays held at ${viewport.width}x${viewport.height}`, async ({ browser }) => {
    const context = await browser.newContext({ viewport, isMobile: true, hasTouch: true });
    try {
      const page = await context.newPage(), errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
      await seed(page, CLASSIC); await page.goto('/'); await page.getByRole('button', { name: 'Begin expedition' }).tap();
      const cdp = await context.newCDPSession(page), t = page.getByTestId('flight-telemetry'), cue = page.getByTestId('combat-target');
      const send = (type: 'touchStart' | 'touchEnd', touchPoints: { id: number; x: number; y: number }[]) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints });
      const b = (await page.getByRole('button', { name: 'Hold to fly', exact: true }).boundingBox())!;
      const fly = { id: 1, x: b.x + b.width / 2, y: b.y + b.height / 2 };
      await page.keyboard.down('KeyV'); await send('touchStart', [fly]);
      let target = { id: 2, x: 0, y: 0 }, found = false;
      for (let n = 0; n < 65; n++) {
        const x = Number(await cue.getAttribute('data-x')), y = Number(await cue.getAttribute('data-y'));
        if (await cue.locator('i').isVisible() && await cue.getAttribute('data-edge') === 'false' && x > 30 && x < viewport.width - 30 && y > (viewport.height > 500 ? 180 : 145) && y < viewport.height - 100) {
          target = { id: 2, x, y }; found = true; break;
        }
        await page.keyboard.down('ArrowRight'); await page.waitForTimeout(80); await page.keyboard.up('ArrowRight');
      }
      expect(found, 'a visible in-world demon to tap').toBe(true);
      const hud = page.getByTestId('battle-hud'), combo = Number(await hud.getAttribute('data-combo'));
      await send('touchStart', [fly, target]); await send('touchEnd', [target]);
      await expect.poll(async () => Number(await hud.getAttribute('data-combo')), { timeout: 8000 }).toBeGreaterThan(combo);
      await send('touchEnd', []); await expect.poll(async () => Number(await t.getAttribute('data-speed')), { timeout: 8000 }).toBeLessThan(.5);
      await page.screenshot({ path: test.info().outputPath('second-finger-strike.png') }); expect(errors).toEqual([]);
    } finally { await context.close(); }
  });
}
