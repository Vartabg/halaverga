import { expect, test } from '@playwright/test';
import { WORLD } from '../src/game/motion';
test('an old checkpoint inside a building restores to the arrival terrace', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('halaverga-flight-v1', JSON.stringify({ checkpoint: { x: -62, y: 33.3, z: 16 } })));
  await page.goto('/'); await page.getByRole('button', { name: 'Begin expedition' }).click();
  const telemetry = page.getByTestId('flight-telemetry');
  await expect(page.getByText('Suit restored to a clear landing.').first()).toBeVisible();
  await expect.poll(async () => JSON.parse((await telemetry.getAttribute('data-position'))!)[2]).toBeCloseTo(65, 1);
  await page.keyboard.press('Space'); await page.keyboard.down('KeyW'); await page.waitForTimeout(800); await page.keyboard.up('KeyW');
  expect(JSON.parse((await telemetry.getAttribute('data-position'))!)[2]).toBeLessThan(63);
});
test('the district edge brakes flight and allows an immediate return', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/'); await page.getByRole('button', { name: 'Begin expedition' }).click();
  await page.keyboard.press('Space'); await page.waitForTimeout(500);
  await page.keyboard.down('KeyW'); await page.keyboard.press('Shift'); await page.waitForTimeout(13500);
  const telemetry = page.getByTestId('flight-telemetry');
  const edge = JSON.parse((await telemetry.getAttribute('data-position'))!);
  expect(edge[2]).toBeGreaterThanOrEqual(WORLD.minZ); expect(edge[2]).toBeLessThan(WORLD.minZ + 4);
  await expect(page.getByText('SURVEY LIMIT · TURN BACK')).toBeVisible();
  await page.waitForTimeout(800); expect(Number(await telemetry.getAttribute('data-speed'))).toBeLessThan(.5);
  await page.keyboard.up('KeyW'); await page.keyboard.down('KeyS'); await page.waitForTimeout(1000); await page.keyboard.up('KeyS');
  expect(JSON.parse((await telemetry.getAttribute('data-position'))!)[2]).toBeGreaterThan(edge[2] + 5);
  expect(errors).toEqual([]);
});
