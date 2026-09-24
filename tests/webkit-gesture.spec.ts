import { existsSync } from 'node:fs';
import { expect, test, webkit } from '@playwright/test';
// One narrow claim, in desktop WebKit (not iPhone validation): during touch play a cancelable gesturestart is preventDefaulted and
// leaves input and play intact. Runs only when Playwright's own WebKit build is already cached; it is never installed here.
const cached = (() => { try { return existsSync(webkit.executablePath()); } catch { return false; } })();
test('WebKit (not iPhone validation): gesturestart during touch play is prevented and leaves input intact', async () => {
  test.skip(!cached, 'Playwright WebKit is not cached on this machine (never installed by this suite)');
  test.info().annotations.push({ type: 'validation', description: 'desktop WebKit emulation, not iPhone validation' });
  const baseURL = test.info().project.use.baseURL ?? 'http://127.0.0.1:3366';
  const browser = await webkit.launch();
  try {
    const context = await browser.newContext({ baseURL, viewport: { width: 852, height: 393 }, hasTouch: true });
    const page = await context.newPage();
    await page.goto('/'); await page.getByRole('button', { name: 'Begin expedition' }).click();
    await expect(page.getByRole('button', { name: 'Pause expedition' })).toBeVisible();
    // Force touch mode: the mode follows the last pointer type, and a synthetic touch pointer is enough for the guard.
    await page.evaluate(() => document.body.dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'touch', bubbles: true })));
    await expect(page.locator('html')).toHaveAttribute('data-input', 'touch');
    const telemetry = page.getByTestId('flight-telemetry');
    await page.waitForTimeout(400);
    const before = { flying: await telemetry.getAttribute('data-flying'), heading: await telemetry.getAttribute('data-heading') };
    const prevented = await page.evaluate(() => {
      const e = new Event('gesturestart', { cancelable: true, bubbles: true }); document.dispatchEvent(e); return e.defaultPrevented;
    });
    expect(prevented).toBe(true);
    await page.waitForTimeout(400);
    await expect(page.getByRole('button', { name: 'Resume flight' })).toHaveCount(0);
    expect({ flying: await telemetry.getAttribute('data-flying'), heading: await telemetry.getAttribute('data-heading') }).toEqual(before);
    await context.close();
  } finally { await browser.close(); }
});
