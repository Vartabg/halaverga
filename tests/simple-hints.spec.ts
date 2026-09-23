import { expect, test, type Browser, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { begin, resume, seed, shots } from './shooter-browser';
// Progressive controls hints (docs/simple-controls.md): one instruction at a time, advanced by doing it, persisted so it never repeats.
const hint = (p: Page) => p.getByTestId('controls-hint');
const soundNotice = (p: Page) => p.locator('p', { hasText: 'Blaster sound is off · Settings' });
const locked = (p: Page) => p.evaluate(() => !!document.pointerLockElement);
const saved = (p: Page) => p.evaluate(() => JSON.parse(localStorage.getItem('halaverga-flight-v1') || '{}').hintProgress);
const errorsOf = (p: Page) => { const errors: string[] = []; p.on('pageerror', e => errors.push(e.message)); return errors; };
// Every text the screen-reader region received, in order (recorded from the first paint, so none is missed between polls).
const recordSaid = (p: Page) => p.addInitScript(() => {
  const said: string[] = []; (window as unknown as { said: string[] }).said = said;
  new MutationObserver(() => {
    const t = document.querySelector('[data-testid=hint-live]')?.textContent ?? '';
    if (t && said[said.length - 1] !== t) said.push(t);
  }).observe(document, { subtree: true, childList: true, characterData: true });
});
const said = (p: Page) => p.evaluate(() => (window as unknown as { said: string[] }).said);
const overlaps = (a: { x: number; y: number; width: number; height: number }, b: typeof a) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

for (const size of [{ width: 1440, height: 1000 }, { width: 640, height: 900 }]) test(`one finger + keyboard: the full sequence at ${size.width} px, persisted`, async ({ page }) => {
  const errors = errorsOf(page); await page.setViewportSize(size); await recordSaid(page); await begin(page, '/?trackpad=simple');
  await expect(hint(page)).toHaveText('Click the scene to start'); await expect(hint(page)).toHaveAttribute('data-step', '0');
  const box = (await hint(page).boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(16); expect(box.x + box.width).toBeLessThanOrEqual(size.width - 16);
  expect(box.y + box.height).toBeLessThan(size.height / 2 - 40); expect(box.height).toBeLessThanOrEqual(34);
  // One message at a time: the one-finger panel steps aside while a hint shows.
  await expect(page.getByTestId('simple-trackpad-hud')).toHaveCount(0);
  // The capture step is exempt from the one-second minimum: the next line follows the lock at once.
  const cx = size.width / 2, cy = size.height * .55;
  await page.mouse.click(cx, cy); await expect.poll(() => locked(page)).toBe(true);
  await expect(hint(page)).toHaveText('Slide to look', { timeout: 500 }); await expect(hint(page)).toHaveAttribute('data-step', '1');
  await page.mouse.move(cx + 150, cy, { steps: 15 });
  await expect(hint(page)).toHaveText('Click to shoot', { timeout: 2000 });
  for (let k = 0; k < 5; k++) { await page.mouse.click(cx + 150, cy); await page.waitForTimeout(200); }
  await expect.poll(() => shots(page)).toBeGreaterThanOrEqual(5);
  await expect(hint(page)).toHaveText('WASD to fly · Space lifts');
  // The sound notice (sound is off on a fresh save) waits while a hint speaks.
  await expect(soundNotice(page)).toHaveCount(0);
  await page.waitForTimeout(1100); await page.keyboard.down('KeyW'); await page.waitForTimeout(400); await page.keyboard.up('KeyW');
  await expect(hint(page)).toHaveCount(0);
  expect((await saved(page)).simple).toBe(4);
  await page.mouse.click(cx + 150, cy); await expect(soundNotice(page)).toBeVisible();
  expect(await said(page)).toEqual(['Click the scene to start', 'Slide to look', 'Click to shoot', 'WASD to fly · Space lifts']);
  expect(await page.evaluate(() => {
    const el = document.querySelector('[data-testid=hint-live]'); return !el || !el.closest('[aria-hidden="true"]');
  })).toBe(true);
  // Never repeats: after a reload only the panel's reminder remains.
  await page.keyboard.press('Escape'); await page.reload(); await page.getByRole('button', { name: 'Begin expedition' }).click();
  await expect(page.getByTestId('shooter-hud')).toBeAttached(); await page.waitForTimeout(400);
  await expect(hint(page)).toHaveCount(0);
  await expect(page.getByTestId('simple-trackpad-hud')).toContainText('CLICK THE SCENE TO LOOK FREELY');
  expect(errors).toEqual([]);
});

test('the live region exists before the first hint and sits outside every aria-hidden element', async ({ page }) => {
  await recordSaid(page); await begin(page, '/?trackpad=simple');
  await expect(hint(page)).toHaveText('Click the scene to start');
  await expect.poll(() => said(page)).toEqual(['Click the scene to start']);
  expect(await page.evaluate(() => !document.querySelector('[data-testid=hint-live]')!.closest('[aria-hidden="true"]'))).toBe(true);
});

test('Esc mid-sequence: the step is kept and the start line returns until the pointer is captured again', async ({ page }) => {
  const errors = errorsOf(page); await seed(page, { hintProgress: { touch: 0, simple: 2, mouse: 0 } }); await begin(page, '/?trackpad=simple');
  await page.mouse.click(720, 550); await expect.poll(() => locked(page)).toBe(true);
  await expect(hint(page)).toHaveText('Click to shoot');
  await page.keyboard.press('Escape'); await expect.poll(() => locked(page)).toBe(false); await resume(page);
  await expect(hint(page)).toHaveText('Click the scene to start'); await expect(hint(page)).toHaveAttribute('data-step', '2');
  await page.mouse.click(720, 550); await expect.poll(() => locked(page)).toBe(true);
  await expect(hint(page)).toHaveText('Click to shoot');
  expect(errors).toEqual([]);
});

test('actions done out of order are credited: flying and shooting during "Slide to look", then a glance, finishes the series', async ({ page }) => {
  const errors = errorsOf(page); await begin(page, '/?trackpad=simple');
  await page.mouse.click(720, 550); await expect.poll(() => locked(page)).toBe(true);
  await expect(hint(page)).toHaveText('Slide to look');
  await page.keyboard.down('KeyW'); await page.waitForTimeout(1500); await page.keyboard.up('KeyW');
  for (let k = 0; k < 6; k++) { await page.mouse.click(720, 550); await page.waitForTimeout(150); }
  await expect.poll(() => shots(page)).toBeGreaterThanOrEqual(5);
  await expect(hint(page)).toHaveText('Slide to look');
  // A gentle 80 px glance (about 0.24 rad) is enough, and the shoot and keys hints were already done.
  await page.mouse.move(800, 550, { steps: 10 });
  await expect(hint(page)).toHaveCount(0, { timeout: 2000 });
  expect((await saved(page)).simple).toBe(4);
  expect(errors).toEqual([]);
});

test('Esc on the last step keeps "WASD to fly": it needs no capture, and a W press finishes it', async ({ page }) => {
  await seed(page, { hintProgress: { touch: 0, simple: 3, mouse: 0 } }); await begin(page, '/?trackpad=simple');
  await expect(hint(page)).toHaveText('WASD to fly · Space lifts');
  await page.mouse.click(720, 550); await expect.poll(() => locked(page)).toBe(true);
  await page.keyboard.press('Escape'); await expect.poll(() => locked(page)).toBe(false); await resume(page);
  await expect(hint(page)).toHaveText('WASD to fly · Space lifts'); await page.waitForTimeout(1100);
  await page.keyboard.down('KeyW'); await page.waitForTimeout(400); await page.keyboard.up('KeyW');
  await expect(hint(page)).toHaveCount(0); expect((await saved(page)).simple).toBe(4);
});

test('mouse mode: start, then move the mouse to look, then click to shoot', async ({ page }) => {
  await seed(page, { desktopMode: 'mouse' }); await begin(page);
  await expect(hint(page)).toHaveText('Click the scene to start'); await expect(hint(page)).toHaveAttribute('data-track', 'mouse');
  await page.mouse.click(720, 550); await expect.poll(() => locked(page)).toBe(true);
  await expect(hint(page)).toHaveText('Move the mouse to look', { timeout: 500 });
  await page.mouse.move(870, 550, { steps: 15 });
  await expect(hint(page)).toHaveText('Click to shoot', { timeout: 2000 });
});

test('free profile: one 6 s line that never touches the saved progress', async ({ page }) => {
  await begin(page, '/?trackpad=free'); const before = await saved(page);
  await expect(hint(page)).toHaveText('Hold C to fire'); await expect(hint(page)).toHaveAttribute('data-track', 'line');
  await expect(hint(page)).toHaveCount(0, { timeout: 8000 });
  // A checkpoint save during the 6 s may write the default progress for the first time; the line itself never advances it.
  const none = { touch: 0, simple: 0, mouse: 0 };
  expect((await saved(page)) ?? none).toEqual(before ?? none);
});

test('blaster off: no controls hint and main\'s one-finger panel', async ({ page }) => {
  await begin(page, '/?trackpad=simple&shooter=0');
  await expect(page.getByTestId('simple-trackpad-hud')).toContainText('CLICK THE SCENE TO LIFT INTO HOVER');
  await page.waitForTimeout(400); await expect(hint(page)).toHaveCount(0);
});

test('reduced motion: the hint has no transition or animation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); await begin(page, '/?trackpad=simple');
  await expect(hint(page)).toBeVisible();
  expect(await hint(page).evaluate(el => { const s = getComputedStyle(el); return [s.transitionDuration, s.animationName]; })).toEqual(['0s', 'none']);
});

test('320 px fine pointer: the hint stays one line inside the gutters', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 }); await begin(page, '/?trackpad=simple');
  await expect(hint(page)).toBeVisible();
  const box = (await hint(page).boundingBox())!;
  expect(box.width).toBeLessThanOrEqual(288); expect(box.height).toBeLessThanOrEqual(34);
});

test('a visible hint passes automated WCAG A and AA checks', async ({ page }) => {
  await begin(page, '/?trackpad=simple'); await expect(hint(page)).toBeVisible();
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([]);
});

async function phone(browser: Browser, viewport: { width: number; height: number }, saved: Record<string, unknown>) {
  const context = await browser.newContext({ viewport, isMobile: true, hasTouch: true }), page = await context.newPage();
  const errors = errorsOf(page); await seed(page, saved);
  await page.goto('/'); await page.getByRole('button', { name: 'Begin expedition' }).tap();
  await expect(page.getByRole('button', { name: 'Pause expedition' })).toBeVisible();
  return { context, page, errors };
}
for (const viewport of [{ width: 393, height: 852 }, { width: 852, height: 393 }]) test.describe(`touch ${viewport.width}x${viewport.height}`, () => {
  test('drag to fly, then point at a drone; progress survives a reload', async ({ browser }) => {
    const { context, page, errors } = await phone(browser, viewport, { autoFire: true });
    await expect(hint(page)).toHaveText('Drag to fly');
    const box = (await hint(page).boundingBox())!, lift = (await page.getByRole('button', { name: 'Lift', exact: true }).boundingBox())!;
    expect(overlaps(box, { x: viewport.width / 2 - 45, y: viewport.height / 2 - 45, width: 90, height: 90 })).toBe(false);
    expect(overlaps(box, lift)).toBe(false);
    const cdp = await context.newCDPSession(page), x = Math.round(viewport.width * .25), y = Math.round(viewport.height * .7);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 1, x, y }] }); await page.waitForTimeout(400);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ id: 1, x, y: y - 30 }] }); await page.waitForTimeout(1200);
    await expect(hint(page)).toHaveText('Point at a drone to fire');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    expect((await saved(page)).touch).toBe(1);
    await page.reload(); await page.getByRole('button', { name: 'Begin expedition' }).tap();
    await expect(hint(page)).toHaveText('Point at a drone to fire');
    expect(errors).toEqual([]); await context.close();
  });
  test('with auto-fire off the second step names the Fire button; a finished series shows nothing', async ({ browser }) => {
    let t = await phone(browser, viewport, { autoFire: false, hintProgress: { touch: 1, simple: 0, mouse: 0 } });
    await expect(hint(t.page)).toHaveText('Point at a drone, hold Fire'); await t.context.close();
    t = await phone(browser, viewport, { hintProgress: { touch: 2, simple: 0, mouse: 0 } });
    await expect(t.page.getByTestId('shooter-hud')).toBeAttached(); await t.page.waitForTimeout(400);
    await expect(hint(t.page)).toHaveCount(0); expect(t.errors).toEqual([]); await t.context.close();
  });
});
