import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { begin, centre, resume, seed, shots, twinTouchPage } from './shooter-browser';
import { legend } from './lab-browser';
import { drawn, errorsOf, hint, locked, recordSaid, said, saved, soundNotice } from './simple-hints-support';
// Progressive controls hints (docs/simple-controls.md): one instruction at a time, advanced by doing it, persisted so it never repeats.
for (const size of [{ width: 1440, height: 1000 }, { width: 640, height: 900 }]) test(`one finger + keyboard: the full sequence at ${size.width} px, persisted`, async ({ page }) => {
  const errors = errorsOf(page); await page.setViewportSize(size); await recordSaid(page); await begin(page, '/?trackpad=simple');
  await expect(hint(page)).toHaveText('Click the scene to start');
  await expect(drawn(page)).toHaveCount(0); // said to screen readers, never drawn
  // One message at a time: the one-finger panel steps aside while a hint shows.
  await expect(page.getByTestId('simple-trackpad-hud')).toHaveCount(0);
  // The capture step is exempt from the one-second minimum: the next line follows the lock at once.
  const cx = size.width / 2, cy = size.height * .55;
  await page.mouse.click(cx, cy); await expect.poll(() => locked(page)).toBe(true);
  await expect(hint(page)).toHaveText('Slide to look', { timeout: 500 });
  await page.mouse.move(cx + 150, cy, { steps: 15 });
  await expect(hint(page)).toHaveText('Click: strike', { timeout: 2000 });
  for (let k = 0; k < 5; k++) { await page.mouse.click(cx + 150, cy); await page.waitForTimeout(200); }
  await expect.poll(() => shots(page)).toBeGreaterThanOrEqual(5);
  // Chain combat: a click launches a strike at the nearest visible demon ahead, which flies the angel (crediting the movement step)
  // and hides the hint during the dive. Either way the series completes; press W only if it is still asking for it.
  const progress = async () => (await saved(page))?.simple;
  await expect.poll(async () => await progress() === 4 || await hint(page).textContent() === 'WASD to fly · Space lifts',
    { timeout: 10000 }).toBe(true);
  if (await progress() !== 4) {
    // The sound notice (sound is off on a fresh save) waits while a hint speaks.
    await expect(soundNotice(page)).toHaveCount(0);
    await page.waitForTimeout(1100); await page.keyboard.down('KeyW'); await page.waitForTimeout(400); await page.keyboard.up('KeyW');
  }
  await expect.poll(progress, { timeout: 10000 }).toBe(4);
  await expect(hint(page)).toHaveText('');
  await page.mouse.click(cx + 150, cy); await expect(soundNotice(page)).toBeVisible();
  expect((await said(page)).slice(0, 3)).toEqual(['Click the scene to start', 'Slide to look', 'Click: strike']);
  expect(await page.evaluate(() => {
    const el = document.querySelector('[data-testid=hint-live]'); return !el || !el.closest('[aria-hidden="true"]');
  })).toBe(true);
  // Never repeats: after a reload only the panel's reminder remains.
  await page.keyboard.press('Escape'); await page.reload(); await page.getByRole('button', { name: 'Ascend Mount Hermon' }).click();
  await expect(page.getByTestId('shooter-hud')).toBeAttached(); await page.waitForTimeout(400);
  await expect(hint(page)).toHaveText('');
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
  await expect(hint(page)).toHaveText('Click: strike');
  await page.keyboard.press('Escape'); await expect.poll(() => locked(page)).toBe(false); await resume(page);
  await expect(hint(page)).toHaveText('Click the scene to start');
  await page.mouse.click(720, 550); await expect.poll(() => locked(page)).toBe(true);
  await expect(hint(page)).toHaveText('Click: strike');
  expect(errors).toEqual([]);
});

test('actions done out of order are credited: flying and shooting during "Slide to look", then a glance, finishes the series', async ({ page }) => {
  const errors = errorsOf(page); await begin(page, '/?trackpad=simple');
  await page.mouse.click(720, 550); await expect.poll(() => locked(page)).toBe(true);
  await expect(hint(page)).toHaveText('Slide to look');
  await page.keyboard.down('KeyW'); await page.waitForTimeout(1500); await page.keyboard.up('KeyW');
  for (let k = 0; k < 6; k++) { await page.mouse.click(720, 550); await page.waitForTimeout(150); }
  await expect.poll(() => shots(page)).toBeGreaterThanOrEqual(5);
  // A click is now a command on the reticle demon; when one lands it counts as a hit, which also credits "Slide to look".
  if (Number(await page.getByTestId('shooter-hud').getAttribute('data-hits')) === 0) await expect(hint(page)).toHaveText('Slide to look');
  // A gentle 80 px glance (about 0.24 rad) is enough, and the shoot and keys hints were already done.
  await page.mouse.move(800, 550, { steps: 10 });
  await expect(hint(page)).toHaveText('', { timeout: 2000 });
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
  await expect(hint(page)).toHaveText(''); expect((await saved(page)).simple).toBe(4);
});

test('mouse mode: start, then move the mouse to look, then click to shoot', async ({ page }) => {
  await seed(page, { desktopMode: 'mouse' }); await begin(page);
  await expect(hint(page)).toHaveText('Click the scene to start');
  await page.mouse.click(720, 550); await expect.poll(() => locked(page)).toBe(true);
  await expect(hint(page)).toHaveText('Move the mouse to look', { timeout: 500 });
  await page.mouse.move(870, 550, { steps: 15 });
  await expect(hint(page)).toHaveText('Click: strike', { timeout: 2000 });
});

// The free cursor is the desktop default again (Garo 2026-09-24): no step hints. The bottom pill that stated the mapping is gone (Garo 2026-11-17).
const noHintFor = async (p: Page, ms: number) => {
  for (let t = 0; t < ms; t += 250) { expect(await hint(p).textContent()).toBe(''); await p.waitForTimeout(250); }
};
for (const [name, url, vw] of [['free profile', '/?trackpad=free', null], ['free profile, blaster off', '/?trackpad=free&shooter=0', null], ['free profile at 325x928', '/?trackpad=free', { width: 325, height: 928 }]] as const) {
  test(`${name}: no controls hint and no bottom pill`, async ({ page }) => {
    const errors = errorsOf(page); if (vw) await page.setViewportSize(vw); await begin(page, url); const before = await saved(page);
    await expect(legend(page)).toHaveCount(0);
    await noHintFor(page, 1500);
    await page.getByRole('button', { name: 'Lift', exact: true }).click();
    await expect(legend(page)).toHaveCount(0); await expect(hint(page)).toHaveText('');
    if (vw) expect(await page.evaluate(() => document.scrollingElement!.scrollWidth <= innerWidth)).toBe(true);
    // A checkpoint save may write the default progress for the first time; nothing here advances it.
    const none = { touch: 0, simple: 0, mouse: 0 };
    expect((await saved(page)) ?? none).toEqual(before ?? none);
    expect(errors).toEqual([]);
  });
}

test('blaster off: no controls hint and main\'s one-finger panel', async ({ page }) => {
  await begin(page, '/?trackpad=simple&shooter=0');
  await expect(page.getByTestId('simple-trackpad-hud')).toContainText('CLICK THE SCENE TO LIFT INTO HOVER');
  await page.waitForTimeout(400); await expect(hint(page)).toHaveText('');
});

test('the coach line is said once for screen readers and never drawn, at 320 px and with reduced motion, and the page passes automated WCAG A and AA checks', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); await page.setViewportSize({ width: 320, height: 640 }); await begin(page, '/?trackpad=simple');
  await expect(hint(page)).toHaveText('Click the scene to start'); await expect(drawn(page)).toHaveCount(0);
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([]);
});

// Touch (twin stick, the default): four steps taught by doing them. Saves are version 3 so the v3 migration keeps the seeded step.
const V3 = { controlsVersion: 3 };
for (const viewport of [{ width: 393, height: 852 }, { width: 852, height: 393 }]) test.describe(`touch ${viewport.width}x${viewport.height}`, () => {
  test('move, look, lift off, then shoot; progress survives a reload', async ({ browser }) => {
    const t = await twinTouchPage(browser, viewport), { page, touch } = t;
    await expect(hint(page)).toHaveText('Left thumb: move');
    await expect(drawn(page)).toHaveCount(0);
    await page.waitForTimeout(1000);
    await touch.down(1, t.stickPoint); await touch.drag(1, 0, -40); await page.waitForTimeout(300); await touch.up(1);
    await expect(hint(page)).toHaveText('Right thumb: look', { timeout: 3000 }); await page.waitForTimeout(1000);
    await touch.down(2, t.lookPoint); await touch.drag(2, 60, 0); await touch.up(2);
    await expect(hint(page)).toHaveText('Tap Lift off to fly', { timeout: 3000 }); await page.waitForTimeout(1000);
    await touch.down(4, centre((await t.rise.boundingBox())!)); await page.waitForTimeout(100); await touch.up(4);
    await expect(hint(page)).toHaveText('Fire: next step', { timeout: 3000 });
    expect((await saved(page)).touch).toBe(3);
    await page.reload(); await page.getByRole('button', { name: 'Ascend Mount Hermon' }).tap();
    await expect(hint(page)).toHaveText('Fire: next step');
    expect(t.errors).toEqual([]); await t.context.close();
  });
  test('with auto-fire off the last step names the Fire button; a finished series shows nothing', async ({ browser }) => {
    let t = await twinTouchPage(browser, viewport, { ...V3, autoFire: false, hintProgress: { touch: 3, simple: 0, mouse: 0 } });
    await expect(hint(t.page)).toHaveText('Fire: next step'); await t.context.close();
    t = await twinTouchPage(browser, viewport, { ...V3, hintProgress: { touch: 4, simple: 0, mouse: 0 } });
    await expect(t.page.getByTestId('shooter-hud')).toBeAttached(); await t.page.waitForTimeout(400);
    await expect(hint(t.page)).toHaveText(''); expect(t.errors).toEqual([]); await t.context.close();
  });
});
