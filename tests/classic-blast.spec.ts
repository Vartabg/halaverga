import { expect, test, type Page } from '@playwright/test';
import { autoTouchPage, centre, heading, shots, speed, telemetry, twinTouchPage, type Touch } from './shooter-browser';
import { aimAtDrone, clearOfDrones, droneIn, drones } from './lab-browser';
// Garo 2026-09-26: the phone default is main 7945430's one-finger flight again, with tap-a-drone shooting on top. System Chrome
// touch emulation (CDP Input.dispatchTouchEvent) in both orientations: it proves the wiring, never the feel on his iPhone.
const PORTRAIT = { width: 393, height: 852 }, LANDSCAPE = { width: 852, height: 393 }, TAU = 2 * Math.PI;
const flying = (p: Page) => telemetry(p).getAttribute('data-flying');
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
/** Polls the stamped heading (every 350 ms) and unwraps it until a full turn; returns the seconds it took, or Infinity. */
async function timeTo360(page: Page, limitMs = 8000) {
  let prev = await heading(page), turned = 0; const t0 = Date.now();
  while (Date.now() - t0 < limitMs) {
    await page.waitForTimeout(50);
    const h = await heading(page); turned += wrap(h - prev); prev = h;
    if (Math.abs(turned) >= TAU) return (Date.now() - t0) / 1000;
  }
  return Infinity;
}
/** A drone eye in the open part of the view (clear of the header and the Lift button), or null. */
const target = (page: Page, v: { width: number; height: number }) =>
  droneIn(page, { x0: 24, y0: 120, x1: v.width - 24, y1: v.height - 150 }, 10);
for (const viewport of [PORTRAIT, LANDSCAPE]) {
  const name = viewport === PORTRAIT ? 'portrait' : 'landscape';
  test.describe(`classic one thumb + tap a drone, ${name}`, () => {
    test('hold lifts and cruises, an edge hold spins 360 with no re-grip, release hovers; no Fire or Aim button', async ({ browser }) => {
      const t = await autoTouchPage(browser, viewport), { page, send, thumb, surface } = t;
      await expect(surface).toHaveAttribute('data-scheme', 'classic');
      await expect(page.getByTestId('fire-button')).toHaveCount(0); await expect(page.getByTestId('aim-button')).toHaveCount(0);
      await expect(page.locator('[data-shooter-controls]')).toHaveCount(0);
      // The crosshair is hidden on classic touch (the finger aims); the HUD itself stays for the hit marker and heat.
      await expect(page.getByTestId('shooter-hud')).toBeAttached();
      expect(await page.evaluate(() => getComputedStyle(document.querySelector('[data-testid=shooter-hud] > div')!).display)).toBe('none');
      await send('touchStart', [thumb]);
      await expect(telemetry(page)).toHaveAttribute('data-flying', 'true', { timeout: 1500 });
      await expect.poll(() => speed(page), { timeout: 2000 }).toBeGreaterThan(5);
      await expect(surface).toHaveAttribute('data-control-mode', 'single');
      // One slide to the right bezel, then the thumb rests there: main's edge hold keeps turning at 1.5 rad/s (about 4.2 s per 360
      // at the very edge; x = width - 1 is 0.98 of it). The direct look of the slide settles in the first 400 ms.
      thumb.x = viewport.width - 1; await send('touchMove', [thumb]); await page.waitForTimeout(400);
      const took = await timeTo360(page);
      test.info().annotations.push({ type: 'classic 360', description: `${name}: edge hold turned 360 deg in ${took.toFixed(2)} s (heading stamped every 350 ms)` });
      expect(took).toBeGreaterThan(3.4); expect(took).toBeLessThan(5.4);
      // Still flying on the same contact through the whole turn (no re-grip). The speed after a 34 m/s circle of about 23 m radius
      // depends on what the terrace put in the way (the clearance assist slows near walls), so it is recorded, not bounded.
      test.info().annotations.push({ type: 'classic 360', description: `${name}: speed after the turn ${(await speed(page)).toFixed(1)} m/s` });
      expect(await flying(page)).toBe('true');
      await expect(surface).toHaveAttribute('data-control-mode', 'single');
      await send('touchEnd', [thumb]);
      await expect.poll(() => speed(page), { timeout: 1500 }).toBeLessThan(.5);
      const rest = await heading(page); await page.waitForTimeout(500); expect(await heading(page)).toBe(rest);
      expect(t.errors).toEqual([]); await t.context.close();
    });
    test('a quick tap on empty space does nothing; a quick tap on a drone fires exactly one 3-shot burst and does not lift', async ({ browser }) => {
      const t = await autoTouchPage(browser, viewport), { page, send, thumb } = t;
      await page.waitForTimeout(600);
      const empty = await clearOfDrones(page, [thumb, { x: viewport.width * .5, y: viewport.height * .55 }, { x: viewport.width * .35, y: viewport.height * .4 }]);
      const before = await shots(page), tap: Touch = { id: 1, x: Math.round(empty.x), y: Math.round(empty.y) };
      await send('touchStart', [tap]); await page.waitForTimeout(60); await send('touchEnd', [tap]);
      await page.waitForTimeout(500);
      expect(await flying(page)).toBe('false'); expect(await shots(page)).toBe(before);
      // Portrait shows less of the terrace: if no drone is in the open view, the arrow keys turn the view onto one first (no touch).
      let d = await target(page, viewport);
      if (!d && await aimAtDrone(page, 8000)) { await page.waitForTimeout(200); d = await target(page, viewport); }
      test.skip(!d, `no drone eye in the open view (${JSON.stringify((await drones(page)).map(e => [Math.round(e.x), Math.round(e.y), e.n]))})`);
      const onDrone: Touch = { id: 2, x: Math.round(d!.x), y: Math.round(d!.y) };
      await send('touchStart', [onDrone]); await page.waitForTimeout(60); await send('touchEnd', [onDrone]);
      await expect.poll(() => shots(page), { timeout: 3000 }).toBe(before + 3);
      await page.waitForTimeout(900);
      expect(await shots(page)).toBe(before + 3); // exactly one burst: no auto-fire follows it
      expect(await flying(page)).toBe('false'); expect(await speed(page)).toBeLessThan(.3);
      expect(t.errors).toEqual([]); await t.context.close();
    });
    test('a second-finger tap on a drone blasts while the first thumb keeps flying', async ({ browser }) => {
      const t = await autoTouchPage(browser, viewport), { page, send, thumb, surface } = t;
      // Turn the view onto a drone before lifting (arrow keys, no touch), so both orientations have one in the open view; the hold
      // that follows flies straight at it. Fail, never skip: this is the portrait proof of the second finger.
      await page.waitForTimeout(600);
      if (!await target(page, viewport)) { expect(await aimAtDrone(page, 12000)).toBe(true); await page.waitForTimeout(200); }
      await send('touchStart', [thumb]);
      await expect(telemetry(page)).toHaveAttribute('data-flying', 'true', { timeout: 1500 });
      await expect.poll(() => speed(page), { timeout: 2000 }).toBeGreaterThan(5);
      let d = await target(page, viewport);
      for (let k = 0; k < 6 && !d; k++) { await page.waitForTimeout(300); d = await target(page, viewport); }
      expect(d, `a drone eye in the open ${name} view while cruising: ${JSON.stringify((await drones(page)).map(e => [Math.round(e.x), Math.round(e.y), e.n]))}`).toBeTruthy();
      const before = await shots(page), second: Touch = { id: 2, x: Math.round(d!.x), y: Math.round(d!.y) };
      await send('touchStart', [thumb, second]); await page.waitForTimeout(60); await send('touchEnd', [second]);
      await expect.poll(() => shots(page), { timeout: 3000 }).toBe(before + 3);
      await expect(surface).toHaveAttribute('data-control-mode', 'single'); // the tap never became a second thumb
      await page.waitForTimeout(600);
      expect(await speed(page)).toBeGreaterThan(5); expect(await flying(page)).toBe('true');
      expect(await shots(page)).toBe(before + 3); // one burst: the second finger's lift never re-fires
      await send('touchEnd', [thumb]);
      expect(t.errors).toEqual([]); await t.context.close();
    });
    test('a second finger held on a drone becomes the look thumb (dual) and never fires', async ({ browser }) => {
      const t = await autoTouchPage(browser, viewport), { page, send, thumb, surface } = t;
      await page.waitForTimeout(600);
      if (!await target(page, viewport)) { expect(await aimAtDrone(page, 12000)).toBe(true); await page.waitForTimeout(200); }
      await send('touchStart', [thumb]);
      await expect(telemetry(page)).toHaveAttribute('data-flying', 'true', { timeout: 1500 });
      await expect.poll(() => speed(page), { timeout: 2000 }).toBeGreaterThan(5);
      // A drone to the right of the flight thumb (the second contact sorts as the look thumb), with 80 px of slide before the 44 px
      // edge zone would add its own turn.
      const right = { x0: thumb.x + 40, y0: 120, x1: viewport.width - 44 - 90, y1: viewport.height - 150 };
      let d = await droneIn(page, right, 10);
      for (let k = 0; k < 6 && !d; k++) { await page.waitForTimeout(300); d = await droneIn(page, right, 10); }
      expect(d, `a drone eye right of the thumb in ${name}: ${JSON.stringify((await drones(page)).map(e => [Math.round(e.x), Math.round(e.y), e.n]))}`).toBeTruthy();
      const before = await shots(page), second: Touch = { id: 2, x: Math.round(d!.x), y: Math.round(d!.y) };
      await send('touchStart', [thumb, second]);
      // Held still within the tap window it is still a tap; past 10 px it joins as main's look thumb and the rest of the slide looks.
      await page.waitForTimeout(120);
      await expect(surface).toHaveAttribute('data-control-mode', 'single');
      const h0 = await heading(page);
      for (let i = 1; i <= 10; i++) { await send('touchMove', [thumb, { ...second, x: second.x + 8 * i }]); await page.waitForTimeout(16); }
      await expect(surface).toHaveAttribute('data-control-mode', 'dual');
      // Look at 0.003 x 1.6 rad per px over the 64 px after the join (16 px in 8 px steps), to the right, no acceleration.
      await page.waitForTimeout(500);
      const turned = wrap((await heading(page)) - h0);
      test.info().annotations.push({ type: 'classic dual', description: `${name}: held second finger slid 80 px turned ${turned.toFixed(3)} rad` });
      expect(Math.abs(turned)).toBeGreaterThan(64 * .0048 * .6); expect(Math.abs(turned)).toBeLessThan(80 * .0048 * 1.4);
      expect(await shots(page)).toBe(before); // a held finger is a thumb, never a burst
      await send('touchEnd', [{ ...second, x: second.x + 80 }]);
      await expect(surface).toHaveAttribute('data-control-mode', 'single'); // main's handoff: the flight thumb stays, re-based
      expect(await shots(page)).toBe(before);
      await send('touchEnd', [thumb]);
      expect(t.errors).toEqual([]); await t.context.close();
    });
    test('twin sticks still work when chosen', async ({ browser }) => {
      const t = await twinTouchPage(browser, viewport), { page, touch, surface, rise, fire } = t;
      await expect(surface).toHaveAttribute('data-scheme', 'twin');
      await expect(rise).toBeVisible(); await expect(fire).toBeVisible();
      await touch.down(1, centre((await rise.boundingBox())!)); await page.waitForTimeout(100); await touch.up(1);
      await expect(telemetry(page)).toHaveAttribute('data-flying', 'true', { timeout: 2000 });
      await touch.down(2, t.stickPoint); await touch.drag(2, 0, -60); await page.waitForTimeout(600);
      expect(await speed(page)).toBeGreaterThan(1.5);
      await touch.up(2);
      expect(t.errors).toEqual([]); await t.context.close();
    });
  });
}
test('fresh storage on a phone starts in the classic one thumb at controls version 6', async ({ browser }) => {
  const context = await browser.newContext({ viewport: PORTRAIT, isMobile: true, hasTouch: true });
  const page = await context.newPage(); await page.goto('/'); await page.getByRole('button', { name: 'Begin expedition' }).tap();
  await expect(page.getByTestId('flight-surface')).toHaveAttribute('data-scheme', 'classic');
  await expect(page.getByRole('button', { name: 'Lift', exact: true })).toBeVisible();
  await expect(page.getByTestId('rise-button')).toHaveCount(0); await expect(page.getByTestId('fire-button')).toHaveCount(0);
  await page.waitForTimeout(2600); // standing still for 2 s saves the checkpoint, and the settings with it
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('halaverga-flight-v1') || '{}'))).toMatchObject({ touchScheme: 'classic', controlsVersion: 6 });
  await context.close();
});
