import { expect, test } from '@playwright/test';
import { droneIn, labPage, lift, shots, tel } from './lab-browser';
// Conduct (spec 5). Desktop (non-touch, system Chrome): hover steers while cruising, a click on empty sky toggles the cruise and
// fires nothing, a click on a drone fires the aimed burst and leaves the cruise alone. Phone (touch emulation): a resting finger
// steers and holds speed, lifting it glides to a hover. Emulation, not an iPhone or a Mac trackpad.

test('desktop: an empty click toggles the cruise with no shot, hover steers, a second click stops', async ({ browser }) => {
  const t = await labPage(browser, 'conduct'), { page } = t;
  await lift(page);
  const fired = await shots(page), a = await tel(page);
  await page.mouse.move(720, 420); await page.mouse.click(720, 420);
  await expect.poll(async () => (await tel(page)).speed, { timeout: 4000 }).toBeGreaterThan(2);
  // Pointing right of centre while cruising turns right (yaw goes negative); no button is held.
  await page.mouse.move(1100, 420, { steps: 10 });
  await expect.poll(async () => (await tel(page)).heading, { timeout: 4000 }).toBeLessThan(a.heading - .3);
  await page.mouse.move(720, 420, { steps: 10 }); await page.waitForTimeout(300);
  await page.mouse.click(720, 420);
  await expect.poll(async () => (await tel(page)).speed, { timeout: 4000 }).toBeLessThan(.3);
  await page.waitForTimeout(450); expect(await shots(page)).toBe(fired);
  // Hovering, the pointer no longer steers.
  const h = (await tel(page)).heading;
  await page.mouse.move(1100, 420, { steps: 10 }); await page.waitForTimeout(800);
  expect(Math.abs((await tel(page)).heading - h)).toBeLessThan(.02);
  expect(t.errors).toEqual([]); await t.context.close();
});

test('desktop: a click on a drone fires the aimed burst and does not start a cruise', async ({ browser }) => {
  const t = await labPage(browser, 'conduct'), { page } = t;
  await lift(page);
  const d = await droneIn(page, { x0: 150, y0: 150, x1: 1250, y1: 820 });
  test.skip(!d, 'no drone in view from the lift point');
  const before = await shots(page);
  await page.mouse.move(d!.x, d!.y); await page.mouse.down(); await page.waitForTimeout(40); await page.mouse.up();
  await expect.poll(() => shots(page), { timeout: 3000 }).toBe(before + 3);
  await page.waitForTimeout(1000);
  expect(await shots(page)).toBe(before + 3);
  expect((await tel(page)).speed).toBeLessThan(.3);
  expect(t.errors).toEqual([]); await t.context.close();
});

test('phone: a resting finger right of centre steers and moves, and lifting it glides to a hover', async ({ browser }) => {
  const t = await labPage(browser, 'conduct', { touch: true, saved: { autoFire: false } }), { page, finger } = t;
  await lift(page, true);
  const a = await tel(page);
  await finger.down({ x: 640, y: 200 }); await finger.drag({ x: 650, y: 200 }, 2);
  await page.waitForTimeout(1500);
  const b = await tel(page);
  test.info().annotations.push({ type: 'conduct', description: `heading ${a.heading} -> ${b.heading}, speed ${b.speed} m/s` });
  expect(b.heading).toBeLessThan(a.heading - .2);
  expect(b.speed).toBeGreaterThan(1);
  await finger.up();
  await expect.poll(async () => (await tel(page)).speed, { timeout: 5000 }).toBeLessThan(.3);
  expect((await tel(page)).flying).toBe(true);
  expect(t.errors).toEqual([]); await t.context.close();
});
