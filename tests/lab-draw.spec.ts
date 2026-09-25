import { expect, test } from '@playwright/test';
import { labPage, lift, said, tel } from './lab-browser';
// Draw the flight on a phone (spec 4; touch emulation in system Chrome, landscape 852 x 393). Live follow, the real wall, the
// rooftop landing, chained strokes and a loop that wraps all the way round. Auto-fire is off so no stray shot moves the hero's arm or the view.
// Emulation, not an iPhone.
const saved = { autoFire: false };

test('live follow: the hero flies along the ink while the finger is still down, and the view does not turn', async ({ browser }) => {
  const t = await labPage(browser, 'draw', { touch: true, saved }), { page, finger } = t;
  await lift(page, true);
  const a = await tel(page);
  // Up and to the right, into open sky over the corridor. The finger stays down while we read the telemetry.
  await finger.down({ x: 430, y: 250 });
  await finger.drag({ x: 600, y: 150 }, 30);
  await page.waitForTimeout(400);
  const b = await tel(page);
  const dx = b.pos[0] - a.pos[0], dy = b.pos[1] - a.pos[1], dz = b.pos[2] - a.pos[2];
  test.info().annotations.push({ type: 'live follow', description: `moved ${Math.hypot(dx, dy, dz).toFixed(1)} m (dx ${dx.toFixed(1)}, dy ${dy.toFixed(1)}) at ${b.speed} m/s before the finger lifted` });
  expect(Math.hypot(dx, dy, dz)).toBeGreaterThan(3);
  expect(dx).toBeGreaterThan(0); expect(dz).toBeLessThan(0); // right and away, as drawn
  expect(b.speed).toBeGreaterThan(8);
  expect(Math.abs(b.heading - a.heading)).toBeLessThan(.02); // no view rotation under the finger
  await finger.up();
  // After release the heading eases toward the path's tangent (to the right: yaw goes negative).
  await expect.poll(async () => (await tel(page)).heading, { timeout: 4000 }).toBeLessThan(a.heading - .05);
  expect(t.errors).toEqual([]); await t.context.close();
});

test('a stroke into a wall: "Path blocked", and the real wall stops the hero outside it', async ({ browser }) => {
  const t = await labPage(browser, 'draw', { touch: true, saved }), { page, finger } = t;
  await lift(page, true);
  // The building right of the corridor (its upper block's face is at x = 27 m). The stroke ends on its wall.
  await finger.down({ x: 440, y: 250 });
  await finger.drag({ x: 720, y: 190 }, 40);
  await finger.up();
  let peak = 0, x = 0;
  await expect.poll(async () => {
    const s = await tel(page); peak = Math.max(peak, s.speed); x = Math.max(x, s.pos[0]);
    return s.speed < .3 && peak > 10;
  }, { timeout: 12000 }).toBe(true);
  const end = await tel(page);
  test.info().annotations.push({ type: 'wall', description: `peak ${peak} m/s, stopped at x ${end.pos[0].toFixed(2)} (face 27.0), max x ${x.toFixed(2)}` });
  expect(await said(page)).toContain('Path blocked');
  expect(x).toBeLessThan(27);
  expect(end.flying).toBe(true);
  await page.waitForTimeout(1000);
  expect(Math.abs((await tel(page)).pos[0] - end.pos[0])).toBeLessThan(.1); // it stays braked, no creep into the wall
  expect(t.errors).toEqual([]); await t.context.close();
});

test('a stroke ending on the arrival terrace roof lands there', async ({ browser }) => {
  const t = await labPage(browser, 'draw', { touch: true, saved }), { page, finger } = t;
  await lift(page, true);
  // Back away from the terrace with the keyboard (keys always win) so its roof is ahead and below.
  await page.keyboard.down('KeyS'); await page.waitForTimeout(2000); await page.keyboard.up('KeyS');
  await expect.poll(async () => (await tel(page)).speed, { timeout: 5000 }).toBeLessThan(.1);
  const back = await tel(page);
  expect(back.pos[2]).toBeGreaterThan(80);
  // From beside the hero down onto the middle of the roof.
  await finger.down({ x: 440, y: 330 });
  await finger.drag({ x: 420, y: 262 }, 40);
  await finger.up();
  await expect.poll(async () => (await tel(page)).flying, { timeout: 12000 }).toBe(false);
  const landed = await tel(page);
  test.info().annotations.push({ type: 'landing', description: `landed at ${landed.pos.map(v => v.toFixed(2)).join(', ')}` });
  expect(Math.abs(landed.pos[0])).toBeLessThan(11.4);
  expect(landed.pos[2]).toBeGreaterThan(55.6); expect(landed.pos[2]).toBeLessThan(74.4);
  expect(landed.pos[1]).toBeCloseTo(21.06, 0); // the roof (20 m) plus the foot height
  expect(t.errors).toEqual([]); await t.context.close();
});

test('chained strokes: each new stroke continues from the hero, which never stops between them', async ({ browser }) => {
  const t = await labPage(browser, 'draw', { touch: true, saved }), { page, finger } = t;
  await lift(page, true);
  const speeds: number[] = [];
  const sample = async (ms: number) => { const end = Date.now() + ms; while (Date.now() < end) { speeds.push((await tel(page)).speed); await page.waitForTimeout(120); } };
  // Three strokes up the corridor, each started while the previous path is still being flown.
  await finger.down({ x: 430, y: 260 }); await finger.drag({ x: 470, y: 150 }, 16); await finger.up();
  await expect.poll(async () => (await tel(page)).speed).toBeGreaterThan(8);
  for (const to of [{ x: 390, y: 150 }, { x: 450, y: 140 }]) {
    await sample(500);
    await finger.down({ x: 430, y: 260 }); await finger.drag(to, 16);
    speeds.push((await tel(page)).speed);
    await finger.up();
  }
  await sample(500);
  test.info().annotations.push({ type: 'chain speeds', description: speeds.map(s => s.toFixed(1)).join(' ') });
  expect(Math.min(...speeds)).toBeGreaterThan(6);
  expect(t.errors).toEqual([]); await t.context.close();
});

test('a drawn loop turns the view all the way round (turn-360 spec 1.8: 270 degrees or more within 2.5 s of the turn starting)', async ({ browser }) => {
  const t = await labPage(browser, 'draw', { touch: true, saved }), { page, finger } = t;
  await lift(page, true);
  // Record the view heading every frame in the page itself, so no sample is lost while the finger draws.
  await page.evaluate(() => {
    const w = window as unknown as { __hs: [number, number][] }, t0 = performance.now();
    w.__hs = [];
    const tick = () => {
      const el = document.querySelector<HTMLElement>('[data-testid=flight-telemetry]');
      if (el) w.__hs.push([performance.now() - t0, Number(el.dataset.heading)]);
      if (performance.now() - t0 < 7000) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  // A counter-clockwise loop from its bottom (up and right first, into open sky), 1.25 turns of radius 75 px: it should turn left.
  const cx = 430, cy = 205, R = 75, n = 60;
  await finger.down({ x: cx, y: cy + R });
  for (let i = 1; i <= n; i++) {
    const a = i / n * 1.25 * 2 * Math.PI;
    await finger.move({ x: cx + R * Math.sin(a), y: cy + R * Math.cos(a) });
    await page.waitForTimeout(8);
  }
  await finger.up();
  await page.waitForTimeout(7200);
  const hs = await page.evaluate(() => (window as unknown as { __hs: [number, number][] }).__hs);
  // Unwrap: the view turns at most 6 rad/s, far under PI per frame.
  let turned = 0, t20 = -1, t270 = -1, reach = 0;
  for (let i = 1; i < hs.length; i++) {
    const d = hs[i][1] - hs[i - 1][1];
    turned += Math.atan2(Math.sin(d), Math.cos(d));
    if (t20 < 0 && turned >= 20 * Math.PI / 180) t20 = hs[i][0];
    if (t270 < 0 && turned >= 270 * Math.PI / 180) t270 = hs[i][0];
    if (t20 >= 0 && hs[i][0] <= t20 + 2500) reach = Math.max(reach, turned);
  }
  test.info().annotations.push({ type: 'draw loop turn', description: `turned ${(turned * 180 / Math.PI).toFixed(0)} deg left; 20 deg at ${(t20 / 1000).toFixed(2)} s, 270 deg at ${(t270 / 1000).toFixed(2)} s after pen-down; ${(reach * 180 / Math.PI).toFixed(0)} deg within 2.5 s of the turn starting (emulation, not an iPhone)` });
  expect(t20).toBeGreaterThan(0);
  expect(reach).toBeGreaterThanOrEqual(270 * Math.PI / 180);
  expect(await said(page)).not.toContain('Path blocked');
  expect(t.errors).toEqual([]); await t.context.close();
});
