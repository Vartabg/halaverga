import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { begin, centre, resume, seed, shots, twinTouchPage } from './shooter-browser';
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

// Touch (twin stick, the default): four steps taught by doing them. Saves are version 3 so the v3 migration keeps the seeded step.
const V3 = { controlsVersion: 3 };
for (const viewport of [{ width: 393, height: 852 }, { width: 852, height: 393 }]) test.describe(`touch ${viewport.width}x${viewport.height}`, () => {
  test('move, look, lift off, then shoot; progress survives a reload', async ({ browser }) => {
    const t = await twinTouchPage(browser, viewport), { page, touch } = t;
    await expect(hint(page)).toHaveText('Left thumb: move');
    const box = (await hint(page).boundingBox())!;
    expect(overlaps(box, { x: viewport.width / 2 - 45, y: viewport.height / 2 - 45, width: 90, height: 90 })).toBe(false);
    for (const b of t.boxes) expect(overlaps(box, b)).toBe(false);
    await page.waitForTimeout(1000);
    await touch.down(1, t.stickPoint); await touch.drag(1, 0, -40); await page.waitForTimeout(300); await touch.up(1);
    await expect(hint(page)).toHaveText('Right thumb: look', { timeout: 3000 }); await page.waitForTimeout(1000);
    await touch.down(2, t.lookPoint); await touch.drag(2, 60, 0); await touch.up(2);
    await expect(hint(page)).toHaveText('Tap Lift off to fly', { timeout: 3000 }); await page.waitForTimeout(1000);
    await touch.down(4, centre((await t.rise.boundingBox())!)); await page.waitForTimeout(100); await touch.up(4);
    await expect(hint(page)).toHaveText('Aim at drones · Fire to shoot', { timeout: 3000 });
    expect((await saved(page)).touch).toBe(3);
    await page.reload(); await page.getByRole('button', { name: 'Begin expedition' }).tap();
    await expect(hint(page)).toHaveText('Aim at drones · Fire to shoot');
    expect(t.errors).toEqual([]); await t.context.close();
  });
  test('with auto-fire off the last step names the Fire button; a finished series shows nothing', async ({ browser }) => {
    let t = await twinTouchPage(browser, viewport, { ...V3, autoFire: false, hintProgress: { touch: 3, simple: 0, mouse: 0 } });
    await expect(hint(t.page)).toHaveText('Hold Fire to shoot'); await t.context.close();
    t = await twinTouchPage(browser, viewport, { ...V3, hintProgress: { touch: 4, simple: 0, mouse: 0 } });
    await expect(t.page.getByTestId('shooter-hud')).toBeAttached(); await t.page.waitForTimeout(400);
    await expect(hint(t.page)).toHaveCount(0); expect(t.errors).toEqual([]); await t.context.close();
  });
});
