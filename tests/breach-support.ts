import { expect, type Page } from '@playwright/test';
type Point = [number, number, number];
export async function flyTo(page: Page, destination: Point, radius = 5) {
  const t = page.getByTestId('flight-telemetry');
  await page.keyboard.down('KeyW');
  try {
    for (let n = 0; n < 190; n++) {
      const p = JSON.parse((await t.getAttribute('data-position'))!) as Point;
      const x = destination[0] - p[0], y = destination[1] - p[1], z = destination[2] - p[2];
      if (Math.hypot(x, y, z) < radius) break;
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
