import { expect, test, type Page } from '@playwright/test';
import { begin, shots, speed, telemetry } from './shooter-browser';
// The default desktop profile (free cursor, blaster on) with the keyboard alone: Space lifts into the cruise the old click started,
// the starting W press is that click (no stacked thrust while held), and Space brakes to hover so a keyboard player can stop.
test.use({ viewport: { width: 1440, height: 900 }, hasTouch: false, isMobile: false });
const scene = (p: Page) => p.getByTestId('flight-surface');
const active = (p: Page) => scene(p).getAttribute('data-trackpad-active');
async function hoverStill(page: Page) {
  await expect(scene(page)).toHaveAttribute('data-trackpad-active', 'false');
  await expect(telemetry(page)).toHaveAttribute('data-flying', 'true');
  await expect.poll(() => speed(page), { timeout: 4000 }).toBeLessThan(.3);
}

test('keys only, default profile: Space lifts and cruises, Space brakes, W holds move and walk as before', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await begin(page);
  // On the ground W walks (7945430) and stops on release.
  await page.keyboard.down('KeyW'); await expect.poll(() => speed(page)).toBeGreaterThan(.5);
  await expect(telemetry(page)).toHaveAttribute('data-flying', 'false');
  await page.keyboard.up('KeyW'); await expect.poll(() => speed(page)).toBeLessThan(.5);
  // Space: lift and cruise at the saved cruise speed.
  await page.keyboard.press('Space');
  await expect(scene(page)).toHaveAttribute('data-trackpad-active', 'true');
  await expect(telemetry(page)).toHaveAttribute('data-flying', 'true');
  await expect.poll(() => speed(page)).toBeGreaterThan(6);
  // Space again, no surface in reach: brake to hover, no shot. (With a surface in reach Space lands, as at 7945430.)
  const fired = await shots(page);
  const landable = await page.getByText('SURFACE IN REACH · LAND').isVisible();
  test.skip(landable, 'a surface came into reach on the first cruise; Space would land here');
  await page.keyboard.press('Space');
  await hoverStill(page);
  expect(await shots(page)).toBe(fired);
  // Strafe keys still move while hovering, and stop on release.
  await page.keyboard.down('KeyD'); await expect.poll(() => speed(page)).toBeGreaterThan(1);
  await page.keyboard.up('KeyD'); await expect.poll(() => speed(page), { timeout: 4000 }).toBeLessThan(.5);
  expect(await active(page)).toBe('false');
  expect(errors).toEqual([]);
});

test('W held from hover takes off at the cruise speed (about 8 m/s), never stacked thrust, and keeps cruising after release', async ({ page }) => {
  await begin(page);
  await page.getByRole('button', { name: 'Lift', exact: true }).click();
  await expect(telemetry(page)).toHaveAttribute('data-flying', 'true');
  await expect.poll(() => speed(page), { timeout: 4000 }).toBeLessThan(.3);
  await page.mouse.move(720, 380);
  await page.keyboard.down('KeyW');
  await expect(scene(page)).toHaveAttribute('data-trackpad-active', 'true');
  // Hold 1.5 s with auto-repeat (a second keyboard.down sends repeat: true): the speed settles near 8 and never reaches
  // keyboard + cruise thrust.
  let peak = 0;
  for (let i = 0; i < 10; i++) { await page.keyboard.down('KeyW'); await page.waitForTimeout(150); peak = Math.max(peak, await speed(page)); }
  expect(peak).toBeGreaterThan(6); expect(peak).toBeLessThan(10);
  await page.keyboard.up('KeyW'); await page.waitForTimeout(600);
  expect(await active(page)).toBe('true');
  const after = await speed(page);
  expect(after).toBeGreaterThan(6); expect(after).toBeLessThan(10);
  // A second, fresh W press while cruising adds thrust exactly as it did at 7945430.
  await page.keyboard.down('KeyW'); await expect.poll(() => speed(page)).toBeGreaterThan(11); await page.keyboard.up('KeyW');
});

test('a touch laptop driven by its mouse keeps selection and zoom (touch-only guards follow the live pointer)', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, hasTouch: true, isMobile: false });
  const page = await context.newPage();
  await page.goto('/'); await page.getByRole('button', { name: 'Begin expedition' }).click();
  await expect(page.getByRole('button', { name: 'Pause expedition' })).toBeVisible();
  const input = () => page.evaluate(() => document.documentElement.dataset.input);
  await page.mouse.click(720, 380); await expect.poll(input).toBe('mouse');
  const blocked = (type: string) => page.evaluate(t => {
    const e = new Event(t, { bubbles: true, cancelable: true });
    document.querySelector('main')!.dispatchEvent(e); return e.defaultPrevented;
  }, type);
  expect(await blocked('selectstart')).toBe(false);
  // A finger lands: touch mode, and the Safari guards come back exactly as on a phone.
  await page.evaluate(() => document.body.dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'touch', bubbles: true })));
  await expect.poll(input).toBe('touch');
  expect(await blocked('selectstart')).toBe(true);
  await context.close();
});
