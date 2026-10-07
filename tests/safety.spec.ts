import { expect, test } from '@playwright/test';
import { WORLD } from '../src/game/motion';
import { legend } from './lab-browser';
test('an old checkpoint inside a building restores to the arrival terrace', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('halaverga-flight-v1', JSON.stringify({ checkpoint: { x: -62, y: 33.3, z: 16 }, shooter: false })));
  await page.goto('/'); await page.getByRole('button', { name: 'Begin expedition' }).click();
  const telemetry = page.getByTestId('flight-telemetry');
  await expect(page.getByText('Suit restored to a clear landing.').first()).toBeVisible();
  await expect.poll(async () => JSON.parse((await telemetry.getAttribute('data-position'))!)[2]).toBeCloseTo(65, 1);
  await page.keyboard.press('Space'); await page.keyboard.down('KeyW'); await page.waitForTimeout(800); await page.keyboard.up('KeyW');
  expect(JSON.parse((await telemetry.getAttribute('data-position'))!)[2]).toBeLessThan(63);
});
test('the district edge eases the suit to a stop, names the fix, and a hands-off suit turns away instead of staying pinned', async ({ page }) => {
  test.setTimeout(90000); // the 2026-10-06 box: a 500 m surge before the edge
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/?shooter=0'); await page.getByRole('button', { name: 'Begin expedition' }).click();
  await page.keyboard.press('Space'); await page.waitForTimeout(500);
  await page.keyboard.down('KeyW'); await page.keyboard.press('Shift');
  const telemetry = page.getByTestId('flight-telemetry');
  // Since 2026-10-06 the north edge is about 500 m out (it was 250): keep surging until the suit has reached it, then watch 3 s more.
  let minZ = Infinity, sawCue = false, sawTip = false, pinned = 0, after = 0;
  for (let i = 0; i < 260 && after < 20; i++) {
    if (sawCue && minZ < WORLD.minZ + 6) after++;
    await page.waitForTimeout(150);
    const z = JSON.parse((await telemetry.getAttribute('data-position'))!)[2]; minZ = Math.min(minZ, z);
    if (await page.getByText(/^EDGE AHEAD/).count()) {
      sawCue = true; sawTip ||= await page.getByText('EDGE AHEAD · MOVE CURSOR TO SIDE').count() > 0;
      expect(await legend(page).count(), 'no controls pill stacked over an edge cue').toBe(0); // limits review F14
    }
    pinned = Number(await telemetry.getAttribute('data-speed')) < .3 && z < WORLD.minZ + 4 ? pinned + 1 : 0;
    expect(pinned, 'pinned at the wall with W held').toBeLessThan(5); // 0.75 s of a stall at the wall
  }
  expect(sawCue).toBe(true); expect(sawTip).toBe(true);
  expect(minZ).toBeGreaterThanOrEqual(WORLD.minZ); expect(minZ).toBeLessThan(WORLD.minZ + 6);
  await page.waitForTimeout(2500);
  const away = JSON.parse((await telemetry.getAttribute('data-position'))!);
  expect(away[2]).toBeGreaterThan(WORLD.minZ + 12); expect(Number(await telemetry.getAttribute('data-speed'))).toBeGreaterThan(5);
  await page.keyboard.up('KeyW'); await page.keyboard.down('KeyS'); await page.waitForTimeout(1000); await page.keyboard.up('KeyS');
  expect(errors).toEqual([]);
});
