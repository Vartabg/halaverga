import { expect, test } from '@playwright/test';
import { CLASSIC, seed } from './shooter-browser';
test('landing can be cancelled and then completed', async ({ page }) => {
  await page.goto('/?shooter=0'); await page.getByRole('button', { name: 'Ascend Mount Hermon' }).click();
  await page.keyboard.press('Space'); await page.waitForTimeout(800);
  await page.keyboard.down('ArrowDown'); await page.waitForTimeout(650); await page.keyboard.up('ArrowDown');
  await expect(page.getByText('SURFACE IN REACH · LAND')).toBeVisible();
  await page.getByRole('button', { name: 'Land', exact: true }).click();
  await page.keyboard.down('KeyD'); await page.waitForTimeout(200); await page.keyboard.up('KeyD');
  const telemetry = page.getByTestId('flight-telemetry');
  await expect(telemetry).toHaveAttribute('data-flying', 'true');
  await expect(page.getByRole('button', { name: 'Land', exact: true })).toBeVisible();
  await page.keyboard.press('KeyB'); await page.waitForTimeout(1000); await page.getByRole('button', { name: 'Land', exact: true }).click();
  await expect(telemetry).toHaveAttribute('data-flying', 'false', { timeout: 10000 });
});
test('graphics loss preserves the field guide and reloads the scene', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: 'Ascend Mount Hermon' }).click();
  await page.evaluate(() => document.querySelector('canvas')?.getContext('webgl2')?.getExtension('WEBGL_lose_context')?.loseContext());
  await expect(page.getByRole('heading', { name: 'The world needs a moment.' })).toBeVisible();
  await page.getByRole('button', { name: 'Field guide', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible(); await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByRole('button', { name: 'Reload scene' }).click();
  await expect(page.getByRole('button', { name: 'Resume flight' })).toBeVisible();
  await page.getByRole('button', { name: 'Resume flight' }).click();
  await page.keyboard.press('Space'); await expect(page.getByTestId('flight-telemetry')).toHaveAttribute('data-flying', 'true');
});
test('touch release and orientation: input released, no pause card, the suit settles', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true });
  const page = await context.newPage(); await seed(page, CLASSIC); await page.goto('/');
  await page.getByRole('button', { name: 'Ascend Mount Hermon' }).tap(); await page.getByRole('button', { name: 'Lift', exact: true }).tap();
  const cdp = await context.newCDPSession(page), telemetry = page.getByTestId('flight-telemetry');
  const speed = async () => Number(await telemetry.getAttribute('data-speed'));
  const drag = async () => {
    const b = (await page.getByRole('button', { name: 'Hold to fly', exact: true }).boundingBox())!;
    const p = { id: 1, x: b.x + b.width / 2, y: b.y + b.height / 2 };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [p] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...p, y: p.y - 40 }] });
    await page.waitForTimeout(750); expect(await speed()).toBeGreaterThan(3);
  };
  await drag();
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await expect.poll(speed, { timeout: 5000 }).toBeLessThan(.5);
  // Rotation mid-drag: touch play keeps going with input released (it never pauses).
  await drag();
  await page.setViewportSize({ width: 852, height: 393 });
  await expect.poll(speed, { timeout: 5000 }).toBeLessThan(.5);
  await expect(page.getByRole('button', { name: 'Resume flight' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Pause expedition' })).toBeVisible();
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await context.close();
});
test('suit asset failure recovers through Reload scene', async ({ page }) => {
  let failSuit = true;
  await page.route('**/models/angel.glb', route => failSuit ? route.abort() : route.continue());
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'The world needs a moment.' })).toBeVisible();
  failSuit = false;
  await page.getByRole('button', { name: 'Reload scene' }).click();
  await expect(page.getByRole('button', { name: 'Ascend Mount Hermon' })).toBeVisible();
  await page.getByRole('button', { name: 'Ascend Mount Hermon' }).click();
  await page.keyboard.press('Space');
  await expect(page.getByTestId('flight-telemetry')).toHaveAttribute('data-flying', 'true');
});
