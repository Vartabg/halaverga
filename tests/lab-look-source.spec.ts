import { expect, test } from '@playwright/test';
import { acquired, aimAtDrone, labPage, shots, tel } from './lab-browser';
// Tap to Blast owns the look source (spec 3.7): touches on the lab surface keep lookSource 'tap', so touch auto-fire (live only
// for lookSource 'touch') never presses in a lab scheme. Auto-fire is ON here (the default) and the view centre is held on a
// drone, so any leak would fire within auto-fire's 100 ms dwell. The arrow-key hunt tags 'keyboard' (auto-fire stays off).
// Mobile emulation in system Chrome.

test('touches on the lab surface never arm auto-fire, even with the view centre on a drone', async ({ browser }) => {
  const t = await labPage(browser, 'draw', { touch: true }), { page, finger } = t;
  test.skip(!(await aimAtDrone(page)), 'the arrow-key hunt found no drone to rest the view on');
  const before = await shots(page);
  // A resting finger in the lower left with small moves inside the tap slop: pointer events over the surface, no stroke.
  let on = 0;
  await finger.down({ x: 160, y: 300 });
  for (let i = 0; i < 16; i++) {
    await finger.move({ x: 160 + (i % 2 ? 4 : -4), y: 300 + (i % 3) * 2 });
    if (await acquired(page)) on++;
    await page.waitForTimeout(60);
  }
  await finger.cancel();
  await page.waitForTimeout(300);
  test.info().annotations.push({ type: 'look source', description: `view centre on a drone in ${on}/16 samples; shots ${before} -> ${await shots(page)}` });
  expect(on, 'the drone drifted off the view centre before the touch').toBeGreaterThan(0);
  expect(await shots(page)).toBe(before);
  expect((await tel(page)).flying).toBe(false);
  expect(t.errors).toEqual([]); await t.context.close();
});

// Tapping Lift/Land still tags lookSource 'touch' (it is not a lab surface), but auto-fire is off in every lab scheme
// (Shooter.tsx: tap-to-blast replaces it), so the tap cannot arm it.
test('tapping Lift in a lab scheme does not arm auto-fire', async ({ browser }) => {
  const t = await labPage(browser, 'draw', { touch: true }), { page } = t;
  test.skip(!(await aimAtDrone(page)), 'the arrow-key hunt found no drone to rest the view on');
  const before = await shots(page);
  await page.getByRole('button', { name: 'Lift', exact: true }).tap();
  await page.waitForTimeout(1200);
  test.info().annotations.push({ type: 'lift tap', description: `shots ${before} -> ${await shots(page)}` });
  expect(await shots(page)).toBe(before);
  expect(t.errors).toEqual([]); await t.context.close();
});
