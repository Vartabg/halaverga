import { expect, type Page } from '@playwright/test';
type Point = [number, number, number];
export async function flyTo(page: Page, destination: Point, radius = 5) {
  const t = page.getByTestId('flight-telemetry');
  await page.keyboard.down('KeyW');
  try {
    for (let n = 0; n < 190; n++) {
      const p = JSON.parse((await t.getAttribute('data-position'))!) as Point;
      const x = destination[0] - p[0], y = destination[1] - p[1], z = destination[2] - p[2];
      // Brake is a flare over a distance (momentumFlight FLIGHT.brake 26 + .02 v^2): start it that far out, to stop at the mark.
      const pace = Number(await t.getAttribute('data-speed')), stop = 25 * Math.log(1 + pace * pace / 1300);
      if (Math.hypot(x, y, z) < radius + stop) break;
      const yaw = Number(await t.getAttribute('data-heading')), pitch = Number(await t.getAttribute('data-pitch'));
      const dy = Math.atan2(Math.sin(Math.atan2(-x, -z) - yaw), Math.cos(Math.atan2(-x, -z) - yaw));
      const dp = Math.atan2(y, Math.hypot(x, z)) - pitch;
      const h = Math.abs(dy) > .075 ? dy > 0 ? 'ArrowLeft' : 'ArrowRight' : null;
      const v = Math.abs(dp) > .075 ? dp > 0 ? 'ArrowUp' : 'ArrowDown' : null;
      if (h) await page.keyboard.down(h); if (v) await page.keyboard.down(v);
      await page.waitForTimeout(75);
      if (h) await page.keyboard.up(h); if (v) await page.keyboard.up(v);
    }
  } finally { await page.keyboard.up('KeyW'); await page.keyboard.press('KeyB'); }
  await expect.poll(async () => Number(await t.getAttribute('data-speed'))).toBeLessThan(.5);
  const p = JSON.parse((await t.getAttribute('data-position'))!) as Point;
  expect(Math.hypot(...p.map((v, i) => v - destination[i])), `real flight reaches ${destination}`).toBeLessThan(radius + 4);
}
/** Presses the strike key for each remaining cut of the sword string (three cuts cast a demon down), waiting for each to land. */
export async function finishString(page: Page, cuts = 2) {
  const hud = page.getByTestId('battle-hud'), landed = async () => Number(await hud.getAttribute('data-banish-fx'));
  for (let n = 0; n < cuts; n++) {
    const before = await landed(); await page.waitForTimeout(140); await page.keyboard.press('KeyC');
    await expect.poll(landed, { timeout: 5000, message: `cut ${n + 2} of the string lands` }).toBeGreaterThan(before);
  }
}
