import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { aiming, autoTouchPage, hud, shots, speed, telemetry } from './shooter-browser';
// Simple-by-default phone controls on the classic one thumb (the default since 2026-09-26): one play button (Lift/Land), no Fire or
// Aim button, no auto-fire (tap a drone to blast: classic-blast.spec.ts), advanced controls behind More controls.
const PORTRAIT = { width: 393, height: 852 }, LANDSCAPE = { width: 852, height: 393 };
type Box = { x: number; y: number; width: number; height: number };
const actions = (p: Page) => p.locator('[class*="actions"]');
const lift = (p: Page) => p.getByRole('button', { name: 'Lift', exact: true });
const aimButton = (p: Page) => p.getByRole('button', { name: 'Aim', exact: true });
const touchHint = (p: Page) => p.getByText('ONE THUMB TO FLY');
const playControls = (p: Page) => p.locator('[class*="actions"] button, [data-shooter-controls] button, [data-testid="fire-button"], [data-testid="aim-button"]')
  .evaluateAll(els => els.filter(el => el.checkVisibility()).length);
const clearOfEdges = (b: Box, v: typeof PORTRAIT) => {
  expect(b.x).toBeGreaterThanOrEqual(24); expect(b.y).toBeGreaterThanOrEqual(24);
  expect(v.width - b.x - b.width).toBeGreaterThanOrEqual(24); expect(v.height - b.y - b.height).toBeGreaterThanOrEqual(24);
};
async function openSettings(page: Page) {
  await page.getByRole('button', { name: 'Flight settings' }).tap(); await expect(page.getByRole('dialog')).toBeVisible();
}
for (const viewport of [PORTRAIT, LANDSCAPE]) {
  const name = viewport === PORTRAIT ? 'portrait' : 'landscape';
  test.describe(`simple touch controls, ${name}`, () => {
    test('classic: Lift/Land is the only play button, in its bottom-right spot; no Fire, no Aim', async ({ browser }) => {
      const t = await autoTouchPage(browser, viewport), { page } = t;
      await expect(page.getByTestId('fire-button')).toHaveCount(0); await expect(aimButton(page)).toHaveCount(0);
      await expect(page.locator('[data-shooter-controls]')).toHaveCount(0);
      expect(await playControls(page)).toBe(1);
      await expect(t.surface).toHaveAttribute('data-scheme', 'classic');
      clearOfEdges((await lift(page).boundingBox())!, viewport);
      await expect(touchHint(page)).toBeHidden();
      expect(t.errors).toEqual([]); await t.context.close();
    });
    test('the blaster section leads on touch with the one-thumb line; no Auto-fire or Aim-button setting on classic', async ({ browser }) => {
      const t = await autoTouchPage(browser, viewport, { aimButton: true }), { page } = t;
      await openSettings(page);
      await expect(page.getByLabel('Auto-fire assist on touch screens')).toHaveCount(0);
      // Touch: the blaster section leads, above the fold, with one line about touch only.
      const line = page.getByText('One thumb flies. Tap a drone to blast it.'); await expect(line).toBeVisible();
      const af = (await line.boundingBox())!, desk = (await page.getByLabel('Desktop controls').boundingBox())!;
      expect(af.y).toBeLessThan(desk.y); expect(af.y + af.height).toBeLessThanOrEqual(viewport.height);
      await expect(page.getByText(/left click fires once the mouse is captured/)).toHaveCount(0);
      // Nothing is away from its default here, so More controls is folded (progressive disclosure) and opens on a tap; on classic
      // it has no Aim-button switch (there is no Aim button) but keeps the shot magnet.
      await expect(page.getByTestId('more-controls')).not.toHaveAttribute('open', /.*/);
      await expect(page.getByLabel('Show tap controls')).toBeHidden();
      await page.getByText('More controls', { exact: true }).tap();
      await expect(page.getByLabel('Show tap controls')).toBeVisible();
      await expect(page.getByLabel('Show Aim button on touch screens')).toHaveCount(0);
      await expect(page.getByLabel('Shot magnet (shots bend toward drones)')).toBeVisible();
      const scan = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
      expect(scan.violations).toEqual([]);
      // Two thumbs (opt-in) brings the Auto-fire assist and the Aim-button switch back.
      await page.getByRole('button', { name: 'Two thumbs' }).tap();
      await expect(page.getByLabel('Auto-fire assist on touch screens')).toBeChecked();
      await expect(page.getByLabel('Show Aim button on touch screens')).toBeVisible();
      expect(t.errors).toEqual([]); await t.context.close();
    });
    test('classic never auto-fires during a one-thumb sweep; Q still aims', async ({ browser }) => {
      const t = await autoTouchPage(browser, viewport), { page, send, thumb } = t;
      const before = await shots(page); let acquired = 0;
      await send('touchStart', [thumb]);
      for (let i = 0; i < 30; i++) {
        thumb.x += 2; await send('touchMove', [thumb]); await page.waitForTimeout(100);
        if (await hud(page).getAttribute('data-acquired') === 'true') acquired++;
      }
      await send('touchEnd', []); await page.waitForTimeout(300);
      test.info().annotations.push({ type: 'auto-fire', description: `acquired in ${acquired}/30 samples, shots ${before} -> ${await shots(page)}` });
      expect(await shots(page)).toBe(before);
      await page.keyboard.down('KeyQ'); await expect.poll(() => aiming(page)).toBe('true');
      await page.keyboard.up('KeyQ'); await expect.poll(() => aiming(page)).toBe('false');
      expect(t.errors).toEqual([]); await t.context.close();
    });
    test('tap controls with the blaster on hide the drag hint; the blaster off keeps it', async ({ browser }) => {
      const t = await autoTouchPage(browser, viewport, { tapControls: true }), { page } = t;
      await expect(page.getByRole('group', { name: 'Tap flight controls' })).toBeVisible();
      await expect(touchHint(page)).toBeHidden();
      await page.goto('/?shooter=0'); await page.getByRole('button', { name: 'Begin expedition' }).tap();
      await expect(page.getByRole('group', { name: 'Tap flight controls' })).toBeVisible();
      await expect(touchHint(page)).toBeVisible();
      expect(t.errors).toEqual([]); await t.context.close();
    });
    test('classic: the 6 s one-thumb line hands over to the drag hint on the ground', async ({ browser }) => {
      const t = await autoTouchPage(browser, viewport), { page } = t;
      await expect(telemetry(page)).toHaveAttribute('data-flying', 'false');
      await expect(page.getByTestId('controls-hint')).toHaveText('Drag to fly · tap a drone');
      await expect(touchHint(page)).toBeHidden();
      await expect(touchHint(page)).toBeVisible({ timeout: 9000 });
      expect(t.errors).toEqual([]); await t.context.close();
    });
    test('blaster off (?shooter=0) is main: no Fire, no controls hint, the drag hint shows', async ({ browser }) => {
      const t = await autoTouchPage(browser, viewport, undefined, '/?shooter=0'), { page } = t;
      await expect(actions(page)).toHaveAttribute('data-shooter', 'false');
      await expect(touchHint(page)).toBeVisible();
      await expect(page.getByTestId('fire-button')).toHaveCount(0);
      await expect(page.getByTestId('controls-hint')).toHaveCount(0);
      // main's settings panel: the tap checkbox in its own place, no More controls disclosure.
      await openSettings(page);
      await expect(page.getByLabel('Show tap controls')).toBeVisible(); await expect(page.getByTestId('more-controls')).toHaveCount(0);
      expect(t.errors).toEqual([]); await t.context.close();
    });
  });
}
// A one-thumb sweep keeps cruise speed: no hip-fire cap and no friction exist any more (Garo 2026-09-26).
test('portrait: the one-thumb sweep keeps its speed with the blaster on', async ({ browser }) => {
  const t = await autoTouchPage(browser, PORTRAIT), { page, cdp } = t;
  const touch = (type: 'touchStart' | 'touchMove', x: number, y: number) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: [{ x, y, id: 1 }] });
  const before = await shots(page);
  await touch('touchStart', 90, 650); await page.waitForTimeout(1100);
  await touch('touchMove', 130, 530); await page.waitForTimeout(1000);
  const pitch = Number(await telemetry(page).getAttribute('data-pitch')), fast = await speed(page), after = await shots(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  test.info().annotations.push({ type: 'flyby', description: `speed ${fast.toFixed(1)} m/s, shots ${before} -> ${after}` });
  expect(fast).toBeGreaterThan(25); expect(pitch).toBeGreaterThan(.4);
  expect(after).toBe(before); // classic has no auto-fire: a sweep never shoots
  expect(t.errors).toEqual([]); await t.context.close();
});

// The real wiring (Shooter.tsx ctx.autoFire, the classic thumbs' lookSource, the greeter's acquisition): two thumbs, the left one
// still (no movement), the right one looking in a snake raster across the spawn view, where the terrace greeter patrols
// (tests/drone-patrol.test.ts keeps it inside a 25 deg cone). The raster holds still whenever the crosshair's per-frame
// data-acquired is on, so the hunt is closed-loop against the moving drone. On classic the resting crosshair never fires: a tapped
// drone is the trigger (classic-blast.spec.ts); auto-fire stays a twin-stick assist.
const acquiredNow = (p: Page) => p.evaluate(() => !!document.querySelector('[data-testid=shooter-hud] [data-acquired="true"]'));
/** acquired: polls with the crosshair acquired; onset: when the latest acquisition began; firstShotAfterOnset: ms, -1 until a shot. */
type Hunt = { acquired: number; shots: number; onset: number; firstShotAfterOnset: number };
async function hunt(t: Awaited<ReturnType<typeof autoTouchPage>>, done: (s: Hunt) => boolean, budgetMs = 30000): Promise<Hunt> {
  const { page, send } = t, v = page.viewportSize()!;
  const left = { id: 1, x: Math.round(v.width * .2), y: Math.round(v.height * .72) }, right = { id: 2, x: Math.round(v.width * .6), y: Math.round(v.height * .62) };
  const rx = right.x, ry = right.y, st: Hunt = { acquired: 0, shots: await shots(page), onset: -1, firstShotAfterOnset: -1 };
  await send('touchStart', [left, right]); await expect(t.surface).toHaveAttribute('data-control-mode', 'dual');
  // 1 px of look drag is 0.0048 rad: columns 8 px apart (the touch magnet cone on the greeter is about 22 px wide), rows 16 px.
  const cols: number[] = []; for (let dx = -32; dx <= 104; dx += 8) cols.push(dx);
  const t0 = Date.now(); let was = false;
  for (let row = 0; Date.now() - t0 < budgetMs; row++) {
    const dy = 16 - 16 * (row % 9), line = row % 2 ? [...cols].reverse() : cols;
    for (let c = 0; c < line.length && Date.now() - t0 < budgetMs; ) {
      const on = await acquiredNow(page), now = Date.now();
      if (on) { st.acquired++; if (!was) st.onset = now; } was = on;
      const fired = await shots(page);
      if (fired > st.shots && st.firstShotAfterOnset < 0 && st.onset >= 0) st.firstShotAfterOnset = now - st.onset;
      st.shots = fired;
      if (done(st)) { await send('touchEnd', [left, right]); return st; }
      if (on) { await page.waitForTimeout(40); continue; }
      right.x = rx + line[c++]; right.y = ry + dy; await send('touchMove', [left, right]); await page.waitForTimeout(40);
    }
  }
  await send('touchEnd', [left, right]); return st;
}
for (const viewport of [PORTRAIT, LANDSCAPE]) test.describe(`classic never auto-fires on the terrace greeter, ${viewport === PORTRAIT ? 'portrait' : 'landscape'}`, () => {
  test('resting the crosshair on the greeter never fires, with the Auto-fire setting on', async ({ browser }) => {
    const t = await autoTouchPage(browser, viewport, { autoFire: true }), { page } = t;
    await expect(page.getByTestId('fire-button')).toHaveCount(0);
    const st = await hunt(t, s => s.acquired >= 12);
    test.info().annotations.push({ type: 'hunt', description: `acquired ${st.acquired} polls, ${st.shots} shots` });
    expect(st.acquired, 'the raster never put the crosshair on the greeter').toBeGreaterThanOrEqual(12);
    expect(st.shots).toBe(0);
    expect(t.errors).toEqual([]); await t.context.close();
  });
});
