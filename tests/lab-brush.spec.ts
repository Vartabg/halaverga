import { expect, test } from '@playwright/test';
import { droneIn, drones, guideShown, labPage, lift, said, shots, tel } from './lab-browser';
// Brush strokes on a phone (spec 6; touch emulation in system Chrome, landscape 852 x 393). Auto-fire is off, so every shot here is
// the lasso's. Each CDP touch sample costs tens of ms, so a swipe uses few samples: a slow drag (over 400 ms) is not a swipe and
// becomes the 30% nudge, as it should. Emulation, not an iPhone.
const saved = { autoFire: false };

test('a swipe up soars: the hero climbs at least 5 m from where the swipe began', async ({ browser }) => {
  const t = await labPage(browser, 'brush', { touch: true, saved }), { page, finger } = t;
  await lift(page, true);
  // After Lift, Brush cruises ahead. Wait for the lift to finish before measuring.
  await expect.poll(async () => (await tel(page)).speed).toBeGreaterThan(10);
  const y0 = (await tel(page)).pos[1];
  const t0 = Date.now();
  await finger.down({ x: 426, y: 330 }); await finger.drag({ x: 426, y: 130 }, 4, 0); await finger.up();
  const ms = Date.now() - t0;
  let peak = -Infinity;
  const end = Date.now() + 2500;
  while (Date.now() < end) { peak = Math.max(peak, (await tel(page)).pos[1] - y0); await page.waitForTimeout(100); }
  test.info().annotations.push({ type: 'soar', description: `swipe took ${ms} ms; peak climb ${peak.toFixed(2)} m (telemetry every 350 ms)` });
  expect(ms).toBeLessThan(400); // otherwise this was a drag, not a swipe
  expect(peak).toBeGreaterThanOrEqual(5);
  expect(t.errors).toEqual([]); await t.context.close();
});

test('a lasso around a drone locks it and fires the aimed burst', async ({ browser }) => {
  const t = await labPage(browser, 'brush', { touch: true, saved }), { page, finger } = t;
  // Lift, then a still 900 ms hold brakes the cruise to a hover, so the view holds still while the circle is drawn. (A lasso
  // drawn on the ground lifts off mid-circle; that case locked less reliably in emulation, see docs/gesture-lab.md.)
  await page.getByRole('button', { name: 'Lift', exact: true }).tap();
  await expect.poll(async () => (await tel(page)).flying).toBe(true);
  await finger.down({ x: 300, y: 330 }); await page.waitForTimeout(1100); await finger.up();
  await expect.poll(async () => (await tel(page)).speed, { timeout: 3000 }).toBeLessThan(.3);
  const before = await shots(page), R = 50, N = 28, notes: string[] = [];
  // Circle a drone that sits clear of the header, the edges, the Land button and the ghost tip.
  // A full circle plus a little overlap, 30 CDP samples (1-2 s here). A second try with a fresh screenshot is allowed and reported.
  for (let attempt = 1; attempt <= 2 && await shots(page) < before + 3; attempt++) {
    const d = await droneIn(page, { x0: 90, y0: 110, x1: 690, y1: 280 }, 12);
    if (!d) { notes.push(`try ${attempt}: no drone in a clear part of the view (${JSON.stringify((await drones(page)).map(e => [Math.round(e.x), Math.round(e.y), e.n]))})`); continue; }
    const at = (i: number) => ({ x: d.x + R * Math.cos(i / N * 2 * Math.PI), y: d.y + R * Math.sin(i / N * 2 * Math.PI) });
    const t0 = Date.now();
    await finger.down(at(0));
    for (let i = 1; i <= N + 2; i++) { await finger.move(at(i)); await page.waitForTimeout(8); }
    await finger.up();
    notes.push(`try ${attempt}: circle ${Date.now() - t0} ms around (${Math.round(d.x)}, ${Math.round(d.y)})`);
    await expect.poll(() => shots(page), { timeout: 2500 }).toBeGreaterThanOrEqual(before + 3).catch(() => {});
  }
  test.skip(!notes.some(n => n.includes('circle')), 'no drone in a clear part of the view from the hover');
  await page.waitForTimeout(600);
  const fired = await shots(page) - before;
  test.info().annotations.push({ type: 'lasso', description: `${notes.join('; ')}; ${fired} shots; said: ${(await said(page)).join(' | ')}` });
  // One locked drone: a 3-shot burst (two body hits or one eye hit kill); at most three drones, three shots each.
  expect(fired).toBeGreaterThanOrEqual(3);
  expect(fired).toBeLessThanOrEqual(9);
  expect(t.errors).toEqual([]); await t.context.close();
});

test('a 250 ms hold shows the guide without braking; holding on to 900 ms brakes to a hover', async ({ browser }) => {
  const t = await labPage(browser, 'brush', { touch: true, saved }), { page, finger } = t;
  await lift(page, true);
  await expect.poll(async () => (await tel(page)).speed).toBeGreaterThan(12);
  await finger.down({ x: 430, y: 250 });
  await expect.poll(() => guideShown(page), { timeout: 800, intervals: [50] }).toBe(true);
  // Still cruising with the guide up (the hold before 900 ms only shows the guide). Telemetry lags up to 350 ms.
  await page.waitForTimeout(250);
  expect((await tel(page)).speed).toBeGreaterThan(12);
  await page.waitForTimeout(900); // past 900 ms
  await finger.up();
  await expect.poll(async () => (await tel(page)).speed, { timeout: 3000 }).toBeLessThan(.5);
  expect((await tel(page)).flying).toBe(true);
  expect(await guideShown(page)).toBe(false);
  expect(t.errors).toEqual([]); await t.context.close();
});
