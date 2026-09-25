import { expect, test, type Page } from '@playwright/test';
const scene = (page: Page) => page.getByTestId('flight-surface');
const telemetry = (page: Page) => page.getByTestId('flight-telemetry');
const speed = async (page: Page) => Number(await telemetry(page).getAttribute('data-speed'));
const heading = async (page: Page) => Number(await telemetry(page).getAttribute('data-heading'));
async function begin(page: Page) {
  await page.addInitScript(() => {
    // The blaster off keeps these the exact 7945430 click-to-fly checks (tests/desktop-blaster.spec.ts covers it on).
    const saved = JSON.parse(localStorage.getItem('halaverga-flight-v1') || '{}');
    if (!saved.trackpadSteering || saved.shooter === undefined) localStorage.setItem('halaverga-flight-v1', JSON.stringify({ trackpadSteering: 'free', controlsVersion: 2, shooter: false, ...saved }));
  });
  await page.goto('/'); await page.getByRole('button', { name: 'Begin expedition' }).click();
  await page.waitForTimeout(250);
}
for (const camera of ['third', 'first']) test(`trackpad-only cruise, steering, speed and hover in ${camera} person`, async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(camera => localStorage.setItem('halaverga-flight-v1', JSON.stringify({ camera, trackpadSteering: 'free', controlsVersion: 2, shooter: false })), camera);
  await begin(page); await page.mouse.click(720, 500);
  await expect(scene(page)).toHaveAttribute('data-trackpad-active', 'true');
  await expect(telemetry(page)).toHaveAttribute('data-flying', 'true');
  await expect.poll(() => speed(page)).toBeGreaterThan(7);
  const before = await heading(page);
  await page.mouse.move(820, 470, { steps: 10 });
  await expect.poll(() => heading(page)).toBeLessThan(before - .2);
  await page.mouse.wheel(0, -100); await expect.poll(() => speed(page)).toBeGreaterThan(10);
  await page.mouse.wheel(0, 100); await expect.poll(() => speed(page)).toBeLessThan(9);
  expect(await page.evaluate(() => document.pointerLockElement)).toBeNull();
  await page.mouse.click(820, 470);
  await expect(scene(page)).toHaveAttribute('data-trackpad-active', 'false');
  await expect.poll(() => speed(page)).toBeLessThan(.3);
  expect(errors).toEqual([]);
});
test('cursor-only takeoff, hover look and assisted landing', async ({ page }) => {
  await begin(page);
  await page.mouse.move(620, 450); await page.mouse.down();
  await page.mouse.move(720, 450, { steps: 10 }); await page.mouse.up();
  await expect(telemetry(page)).toHaveAttribute('data-flying', 'false');
  await expect.poll(() => heading(page)).toBeLessThan(-.2);
  await page.mouse.click(720, 450); await page.waitForTimeout(800); await page.mouse.click(720, 450);
  await expect.poll(() => speed(page)).toBeLessThan(.3);
  await page.mouse.down(); await page.mouse.move(720, 800, { steps: 15 }); await page.mouse.up();
  await expect(scene(page)).toHaveAttribute('data-trackpad-active', 'false');
  await expect(page.getByText('SURFACE IN REACH · LAND')).toBeVisible();
  await page.getByRole('button', { name: 'Land', exact: true }).click();
  await expect(telemetry(page)).toHaveAttribute('data-flying', 'false', { timeout: 10000 });
  expect(await page.evaluate(() => document.pointerLockElement)).toBeNull();
});
test('HUD hover keeps the cruise; a click, resize, pause and zoom clear it without re-engaging it', async ({ page }) => {
  await begin(page); await page.mouse.click(720, 500);
  await expect.poll(() => speed(page)).toBeGreaterThan(7);
  // Turn-360 spec 1.5: the header no longer counts as leaving, so hovering its buttons keeps cruising (and steering).
  await page.getByRole('button', { name: 'Flight settings' }).hover(); await page.waitForTimeout(400);
  await expect(scene(page)).toHaveAttribute('data-trackpad-active', 'true');
  // hover() jumps the cursor about 560 px right in one move, a roughly 100 deg steer: speed dips in that turn, then recovers.
  await expect.poll(() => speed(page)).toBeGreaterThan(7);
  await page.mouse.click(720, 500);
  await expect(scene(page)).toHaveAttribute('data-trackpad-active', 'false');
  await expect.poll(() => speed(page)).toBeLessThan(.3);
  await page.mouse.click(720, 500); await page.setViewportSize({ width: 1200, height: 900 });
  await expect(scene(page)).toHaveAttribute('data-trackpad-active', 'false');
  await expect.poll(() => speed(page)).toBeLessThan(.3);
  await page.mouse.click(600, 450);
  const zoomPrevented = await scene(page).evaluate(el => {
    const event = new WheelEvent('wheel', { deltaY: -100, ctrlKey: true, bubbles: true, cancelable: true });
    el.dispatchEvent(event); return event.defaultPrevented;
  });
  expect(zoomPrevented).toBe(false);
  await expect(scene(page)).toHaveAttribute('data-trackpad-active', 'false');
  await page.mouse.click(600, 450);
  await scene(page).dispatchEvent('gesturestart', { bubbles: true });
  await expect(scene(page)).toHaveAttribute('data-trackpad-active', 'false');
  await page.mouse.click(600, 450); await page.getByRole('button', { name: 'Pause expedition' }).click();
  await page.getByRole('button', { name: 'Resume flight' }).click();
  await expect(scene(page)).toHaveAttribute('data-trackpad-active', 'false');
  await page.waitForTimeout(400);
  const position = await telemetry(page).getAttribute('data-position');
  await page.waitForTimeout(500); expect(await telemetry(page).getAttribute('data-position')).toBe(position);
  await page.mouse.click(600, 450); await expect.poll(() => speed(page)).toBeGreaterThan(7);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(page.getByRole('button', { name: 'Resume flight' })).toBeVisible();
});
test('optional mouse capture persists and failure offers trackpad recovery', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await begin(page); await page.getByRole('button', { name: 'Flight settings' }).click();
  await page.getByLabel('Desktop controls').selectOption('mouse');
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.mouse.click(720, 500);
  await expect.poll(() => page.evaluate(() => document.pointerLockElement?.tagName)).toBe('CANVAS');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Resume flight' })).toBeVisible();
  await page.reload(); await page.getByRole('button', { name: 'Begin expedition' }).click();
  await page.getByRole('button', { name: 'Flight settings' }).click();
  await expect(page.getByLabel('Desktop controls')).toHaveValue('mouse');
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.evaluate(() => { document.querySelector('canvas')!.requestPointerLock = () => Promise.reject(new Error('Capture unavailable')); });
  await page.mouse.click(720, 500);
  await expect(page.getByText('Mouse capture is unavailable.', { exact: false }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Flight settings' }).click();
  await page.getByLabel('Desktop controls').selectOption('trackpad');
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.mouse.click(720, 500); await expect.poll(() => speed(page)).toBeGreaterThan(7);
  expect(errors).toEqual([]);
});
test('edge steering continues at rest; touch handover and cancelled drag stay neutral', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, hasTouch: true });
  await context.addInitScript(() => localStorage.setItem('halaverga-flight-v1', JSON.stringify({ sustainedEdges: true, trackpadSteering: 'free', controlsVersion: 2, shooter: false })));
  const page = await context.newPage(); await begin(page); await page.mouse.click(720, 500);
  await page.mouse.move(1430, 500, { steps: 10 }); await page.waitForTimeout(450);
  const before = await heading(page); await page.waitForTimeout(450);
  expect(await heading(page)).toBeLessThan(before - .25);
  const cdp = await context.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 500, y: 600, id: 1 }] });
  await expect(scene(page)).toHaveAttribute('data-trackpad-active', 'false');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await expect.poll(() => speed(page)).toBeLessThan(.3);
  await page.mouse.move(720, 500); await page.mouse.down();
  await scene(page).dispatchEvent('pointercancel', { pointerType: 'mouse', pointerId: 1 });
  await page.mouse.up(); await expect(scene(page)).toHaveAttribute('data-trackpad-active', 'false');
  await page.mouse.click(720, 500); await expect(scene(page)).toHaveAttribute('data-trackpad-active', 'true');
  await scene(page).dispatchEvent('pointercancel', { pointerType: 'mouse', pointerId: 1 });
  await expect(scene(page)).toHaveAttribute('data-trackpad-active', 'false');
  await context.close();
});
// Turn-360 spec 1.5 (Chromium on this Mac; not trackpad hardware, not a windowed-browser check on a real display).
const surfaceOut = (page: Page, x: number, y: number) => page.evaluate(([cx, cy]) => {
  document.elementFromPoint(Math.min(cx, innerWidth - 1), Math.min(cy, innerHeight - 1))!
    .dispatchEvent(new PointerEvent('pointerout', { bubbles: true, clientX: cx, clientY: cy, pointerType: 'mouse', pointerId: 1, relatedTarget: null }));
}, [x, y]);
test('turning 360: the pointer held at the right edge turns 300 deg or more in 2.5 s', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage(); await begin(page); await page.mouse.click(720, 450);
  await expect(scene(page)).toHaveAttribute('data-trackpad-active', 'true');
  const before = await heading(page);
  await page.mouse.move(1438, 450, { steps: 8 });
  await expect.poll(() => heading(page), { timeout: 2500, intervals: [200] }).toBeLessThan(before - 300 * Math.PI / 180);
  await expect(scene(page)).toHaveAttribute('data-trackpad-active', 'true');
  await context.close();
});
test('a side exit keeps turning, a top exit flies straight after about 1 s, and a click brakes', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage(); await begin(page); await page.mouse.click(720, 450);
  await page.mouse.move(1430, 450, { steps: 8 }); await surfaceOut(page, 1440, 450);
  await page.waitForTimeout(400);
  const a = await heading(page); await page.waitForTimeout(1200);
  expect(await heading(page)).toBeLessThan(a - 2.5);
  await expect(scene(page)).toHaveAttribute('data-trackpad-active', 'true');
  // Back inside: steering is live again; then out through the top near the right corner (a partial edge turn, classified top).
  await page.mouse.move(720, 300, { steps: 6 }); await page.mouse.move(1400, 2, { steps: 6 }); await surfaceOut(page, 1400, 0);
  await page.waitForTimeout(1700);
  const b = await heading(page); await page.waitForTimeout(1000);
  expect(Math.abs(await heading(page) - b)).toBeLessThan(.02);
  await expect(scene(page)).toHaveAttribute('data-trackpad-active', 'true');
  await page.mouse.click(720, 450);
  await expect(scene(page)).toHaveAttribute('data-trackpad-active', 'false');
  await expect.poll(() => speed(page)).toBeLessThan(.3);
  await context.close();
});
