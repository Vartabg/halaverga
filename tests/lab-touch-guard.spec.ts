import { expect, test, type Page } from '@playwright/test';
import { labPage, lift, tel, PHONE } from './lab-browser';
// The touch reliability floor with a lab scheme on (spec 2.1, 9): strokes that start in the side strips or the bottom band (the
// iOS home-indicator zone) are ignored, nothing navigates or pauses, and a pointercancel (iOS taking the touch) leaves no
// movement behind. Mobile emulation in system Chrome: Safari's own edge and home gestures cannot be reproduced here, so this
// proves the start filter and the cancel path, not the iPhone (docs/gesture-lab.md device checklist).
const saved = { autoFire: false };
const pauseCard = (p: Page) => p.getByRole('button', { name: 'Resume flight' });

test('Draw: strokes starting in a side strip or the bottom band are ignored; one starting inside flies', async ({ browser }) => {
  const t = await labPage(browser, 'draw', { touch: true, saved }), { page, finger } = t;
  const url = page.url(), length = await page.evaluate(() => history.length), W = PHONE.width, H = PHONE.height;
  // On the ground an accepted Draw stroke lifts off; an ignored one leaves the explorer standing.
  for (const [from, to] of [
    [{ x: 5, y: 250 }, { x: 300, y: 200 }], // left strip (a back-swipe start)
    [{ x: W - 5, y: 250 }, { x: W - 300, y: 200 }], // right strip
    [{ x: 430, y: H - 8 }, { x: 440, y: 150 }], // bottom band (a home-indicator swipe up)
  ]) {
    await finger.down(from); await finger.drag(to, 12); await finger.up();
    await page.waitForTimeout(900);
    const s = await tel(page);
    expect(s.flying, JSON.stringify(from)).toBe(false);
    expect(s.speed, JSON.stringify(from)).toBeLessThan(.1);
  }
  expect(page.url()).toBe(url);
  expect(await page.evaluate(() => history.length)).toBe(length);
  await expect(page.getByRole('heading', { name: 'Leave the game?' })).toHaveCount(0);
  await expect(pauseCard(page)).toHaveCount(0);
  // The control: the same stroke from inside the strips lifts off and flies.
  await finger.down({ x: 60, y: 250 }); await finger.drag({ x: 300, y: 180 }, 12); await finger.up();
  await expect.poll(async () => (await tel(page)).flying, { timeout: 4000 }).toBe(true);
  await expect(pauseCard(page)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Pause expedition' })).toBeVisible();
  expect(t.errors).toEqual([]); await t.context.close();
});

for (const scheme of ['draw', 'conduct', 'brush'] as const) {
  test(`${scheme}: a pointercancel mid-gesture leaves no movement and no pause`, async ({ browser }) => {
    const t = await labPage(browser, scheme, { touch: true, saved }), { page, finger } = t;
    await lift(page, true);
    if (scheme === 'brush') {
      // Brush cruises after Lift; a stroke in progress, then iOS cancels it: the cancel clears the lab bus and stops the cruise.
      await expect.poll(async () => (await tel(page)).speed).toBeGreaterThan(10);
      await finger.down({ x: 430, y: 250 }); await finger.drag({ x: 470, y: 230 }, 4);
    } else {
      // Draw: a path being drawn; Conduct: a resting finger right of centre (steering and moving).
      await finger.down({ x: 430, y: 250 });
      await finger.drag(scheme === 'draw' ? { x: 600, y: 160 } : { x: 640, y: 210 }, scheme === 'draw' ? 24 : 4);
      await expect.poll(async () => (await tel(page)).speed, { timeout: 4000 }).toBeGreaterThan(1);
    }
    await finger.cancel();
    await expect.poll(async () => (await tel(page)).speed, { timeout: 6000 }).toBeLessThan(.3);
    const h = (await tel(page)).heading;
    await page.waitForTimeout(1000);
    const s = await tel(page);
    expect(s.speed).toBeLessThan(.3); expect(Math.abs(s.heading - h)).toBeLessThan(.02); expect(s.flying).toBe(true);
    await expect(pauseCard(page)).toHaveCount(0);
    expect(t.errors).toEqual([]); await t.context.close();
  });
}
