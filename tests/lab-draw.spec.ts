import { expect, test } from '@playwright/test';
import { labPage, lift, said, tel } from './lab-browser';
// Draw the flight on a phone (spec 4; touch emulation in system Chrome, landscape 852 x 393). Live follow, the real wall, the
// rooftop landing and chained strokes. Auto-fire is off so no stray shot moves the hero's arm or the view. Emulation, not an iPhone.
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
