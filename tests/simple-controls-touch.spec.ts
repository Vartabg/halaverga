import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { aiming, autoTouchPage, hud, shots, speed, telemetry } from './shooter-browser';
// Simple-by-default phone controls: auto-fire on, one play button (Lift/Land), advanced controls behind More controls.
const PORTRAIT = { width: 393, height: 852 }, LANDSCAPE = { width: 852, height: 393 };
type Box = { x: number; y: number; width: number; height: number };
const actions = (p: Page) => p.locator('[class*="actions"]');
const lift = (p: Page) => p.getByRole('button', { name: 'Lift', exact: true });
const aimButton = (p: Page) => p.getByRole('button', { name: 'Aim', exact: true });
const touchHint = (p: Page) => p.getByText('ONE THUMB TO FLY');
const playControls = (p: Page) => p.locator('[class*="actions"] button, [data-shooter-controls] button')
  .evaluateAll(els => els.filter(el => el.checkVisibility()).length);
const clearOfEdges = (b: Box, v: typeof PORTRAIT) => {
  expect(b.x).toBeGreaterThanOrEqual(24); expect(b.y).toBeGreaterThanOrEqual(24);
  expect(v.width - b.x - b.width).toBeGreaterThanOrEqual(24); expect(v.height - b.y - b.height).toBeGreaterThanOrEqual(24);
};
const intersects = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
async function openSettings(page: Page) {
  await page.getByRole('button', { name: 'Flight settings' }).tap(); await expect(page.getByRole('dialog')).toBeVisible();
}
async function closeSettings(page: Page) {
  await page.getByRole('button', { name: 'Close dialog' }).tap(); await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Pause expedition' })).toBeVisible();
}
for (const viewport of [PORTRAIT, LANDSCAPE]) {
  const name = viewport === PORTRAIT ? 'portrait' : 'landscape';
  test.describe(`simple touch controls, ${name}`, () => {
    test('fresh storage: Lift/Land is the only play button, in its bottom-right spot', async ({ browser }) => {
      const t = await autoTouchPage(browser, viewport), { page } = t;
      await expect(page.getByTestId('fire-button')).toHaveCount(0); await expect(aimButton(page)).toHaveCount(0);
      expect(await playControls(page)).toBe(1);
      await expect(actions(page)).toHaveAttribute('data-fire', 'false');
      clearOfEdges((await lift(page).boundingBox())!, viewport);
      await expect(touchHint(page)).toBeHidden();
      expect(t.errors).toEqual([]); await t.context.close();
    });
    test('Auto-fire is on by default; turning it off brings Fire back and survives a reload', async ({ browser }) => {
      const t = await autoTouchPage(browser, viewport), { page } = t;
      await openSettings(page);
      await expect(page.getByLabel('Auto-fire on touch screens')).toBeChecked();
      // Touch: the blaster section leads, above the fold, with one line about touch only.
      const af = (await page.getByLabel('Auto-fire on touch screens').boundingBox())!, desk = (await page.getByLabel('Desktop controls').boundingBox())!;
      expect(af.y).toBeLessThan(desk.y); expect(af.y + af.height).toBeLessThanOrEqual(viewport.height);
      await expect(page.getByText('The suit fires when the crosshair rests on a drone. Turn off for a Fire button.')).toBeVisible();
      await expect(page.getByText(/left click fires once the mouse is captured/)).toHaveCount(0);
      await expect(page.getByLabel('Show tap controls')).toBeHidden();
      await expect(page.getByRole('button', { name: 'Toggle aim' })).toBeHidden();
      await page.getByLabel('Auto-fire on touch screens').uncheck(); await closeSettings(page);
      const fire = page.getByTestId('fire-button'); await expect(fire).toBeVisible();
      await expect(actions(page)).toHaveAttribute('data-fire', 'true');
      const l = (await lift(page).boundingBox())!, f = (await fire.boundingBox())!;
      expect(l.y + l.height).toBeLessThanOrEqual(f.y);
      expect(await playControls(page)).toBe(2);
      await page.reload(); await page.getByRole('button', { name: 'Begin expedition' }).tap();
      await expect(page.getByTestId('fire-button')).toBeVisible();
      expect(await page.evaluate(() => JSON.parse(localStorage.getItem('halaverga-flight-v1') || '{}').autoFire)).toBe(false);
      expect(t.errors).toEqual([]); await t.context.close();
    });
    test('More controls: the opt-in Aim button sits clear of Lift and the edges', async ({ browser }) => {
      const t = await autoTouchPage(browser, viewport), { page } = t;
      await openSettings(page);
      await page.getByText('More controls', { exact: true }).tap();
      await page.getByLabel('Show Aim button on touch screens').check(); await closeSettings(page);
      await expect(aimButton(page)).toBeVisible(); await expect(page.getByTestId('fire-button')).toHaveCount(0);
      const a = (await aimButton(page).boundingBox())!, l = (await lift(page).boundingBox())!;
      clearOfEdges(a, viewport); expect(intersects(a, l)).toBe(false);
      await openSettings(page);
      await expect(page.getByTestId('more-controls')).toHaveAttribute('open', '');
      await expect(page.getByLabel('Show tap controls')).toBeVisible();
      const scan = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
      expect(scan.violations).toEqual([]);
      expect(t.errors).toEqual([]); await t.context.close();
    });
    // Negative half only (a sweep that never meets a drone passes with 0 shots); the positive half is the hunt tests below.
    test('auto-fire never fires without a target under the crosshair; Q still aims', async ({ browser }) => {
      const t = await autoTouchPage(browser, viewport), { page, send, thumb } = t;
      const samples: { acquired: boolean; shots: number }[] = [];
      await send('touchStart', [thumb]);
      for (let i = 0; i < 30; i++) {
        thumb.x += 2; await send('touchMove', [thumb]); await page.waitForTimeout(100);
        samples.push({ acquired: await hud(page).getAttribute('data-acquired') === 'true', shots: await shots(page) });
      }
      await send('touchEnd', []);
      // A shot needs an acquired target within the last few stamps (100 ms dwell, 150 ms grace, 100 ms stamp latency).
      for (let i = 1; i < samples.length; i++) if (samples[i].shots > samples[i - 1].shots)
        expect(samples.slice(Math.max(0, i - 3), i + 1).some(s => s.acquired), `shot at sample ${i} without a target`).toBe(true);
      if (!samples.some(s => s.acquired)) expect(samples.at(-1)!.shots).toBe(0);
      test.info().annotations.push({ type: 'auto-fire', description: `acquired in ${samples.filter(s => s.acquired).length}/30 samples, ${samples.at(-1)!.shots} shots` });
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
    test('finished touch hints hand over to the drag hint on the ground', async ({ browser }) => {
      const t = await autoTouchPage(browser, viewport, { hintProgress: { touch: 2, simple: 0, mouse: 0 } }), { page } = t;
      await expect(telemetry(page)).toHaveAttribute('data-flying', 'false');
      await expect(touchHint(page)).toBeVisible();
      expect(t.errors).toEqual([]); await t.context.close();
    });
    test('blaster off (?shooter=0) is main: no Fire, no controls hint, the drag hint shows', async ({ browser }) => {
      const t = await autoTouchPage(browser, viewport, undefined, '/?shooter=0'), { page } = t;
      await expect(actions(page)).toHaveAttribute('data-fire', 'false');
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
// Objection 2: a one-thumb sweep with auto-fire on keeps cruise speed (no hip-fire cap, no friction).
test('portrait: the one-thumb sweep keeps its speed with auto-fire on', async ({ browser }) => {
  const t = await autoTouchPage(browser, PORTRAIT), { page, cdp } = t;
  const touch = (type: 'touchStart' | 'touchMove', x: number, y: number) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: [{ x, y, id: 1 }] });
  const before = await shots(page);
  await touch('touchStart', 90, 650); await page.waitForTimeout(1100);
  await touch('touchMove', 130, 530); await page.waitForTimeout(1000);
  const pitch = Number(await telemetry(page).getAttribute('data-pitch')), fast = await speed(page), after = await shots(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  // Speed only: this sweep does not control whether the crosshair crosses a drone, so the shot count is recorded, not claimed.
  test.info().annotations.push({ type: 'flyby', description: `speed ${fast.toFixed(1)} m/s, shots ${before} -> ${after}` });
  expect(fast).toBeGreaterThan(25); expect(pitch).toBeGreaterThan(.4);
  expect(t.errors).toEqual([]); await t.context.close();
});

// The real wiring (Shooter.tsx ctx.autoFire, TouchControls' lookSource, the greeter's acquisition): two thumbs, the left one
// still (no movement), the right one looking in a snake raster across the spawn view, where the terrace greeter patrols
// (tests/drone-patrol.test.ts keeps it inside a 25 deg cone). The raster holds still whenever the crosshair's per-frame
// data-acquired is on, so the hunt is closed-loop against the moving drone.
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
for (const viewport of [PORTRAIT, LANDSCAPE]) test.describe(`auto-fire on the terrace greeter, ${viewport === PORTRAIT ? 'portrait' : 'landscape'}`, () => {
  test('fires once the crosshair rests on the greeter, then never while paused', async ({ browser }) => {
    const t = await autoTouchPage(browser, viewport), { page } = t;
    const st = await hunt(t, s => s.shots > 0);
    test.info().annotations.push({ type: 'hunt', description: `acquired ${st.acquired} polls, ${st.shots} shots, first shot ${st.firstShotAfterOnset} ms after the crosshair settled` });
    expect(st.acquired, 'the raster never put the crosshair on the greeter').toBeGreaterThan(0);
    expect(st.shots, 'auto-fire never fired on an acquired drone').toBeGreaterThan(0);
    // 100 ms dwell, a 100 ms HUD stamp and the poll's own latency.
    expect(st.firstShotAfterOnset).toBeGreaterThanOrEqual(0); expect(st.firstShotAfterOnset).toBeLessThan(700);
    // Paused (the HUD is unmounted, so the count is read either side): at 9 Hz, 1.5 s of paused fire would add about 13 shots;
    // at most the shot or two already on its way during the tap may land. The remounted HUD stamps the live count at once.
    const before = await shots(page); await openSettings(page); await page.waitForTimeout(1500); await closeSettings(page);
    expect(await shots(page) - before).toBeLessThanOrEqual(2);
    expect(t.errors).toEqual([]); await t.context.close();
  });
  test('with Auto-fire off, resting the crosshair on the greeter never fires', async ({ browser }) => {
    const t = await autoTouchPage(browser, viewport, { autoFire: false }), { page } = t;
    await expect(page.getByTestId('fire-button')).toBeVisible();
    const st = await hunt(t, s => s.acquired >= 12);
    expect(st.acquired, 'the raster never put the crosshair on the greeter').toBeGreaterThanOrEqual(12);
    expect(st.shots).toBe(0);
    expect(t.errors).toEqual([]); await t.context.close();
  });
});
