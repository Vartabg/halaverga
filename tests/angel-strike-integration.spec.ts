import { finishString } from './flight-support';
import { expect, test } from '@playwright/test';

test('the CC0 angel dives into a live demon and continues the banishment loop', async ({ page }) => {
  test.setTimeout(90000);
  const errors: string[] = [], models = new Set<string>();
  page.on('pageerror', e => errors.push(e.message));
  page.on('response', r => { if (r.ok() && r.url().endsWith('.glb')) models.add(new URL(r.url()).pathname); });
  await page.goto('/'); await page.getByRole('button', { name: 'Ascend Mount Hermon' }).click();
  await page.keyboard.press('Space'); await page.waitForTimeout(600); await page.keyboard.press('Space');
  await page.keyboard.down('KeyV');
  const hud = page.getByTestId('battle-hud'), telemetry = page.getByTestId('flight-telemetry');
  let found = false;
  for (let k = 0; k < 90 && !found; k++) {
    await page.keyboard.down('ArrowRight'); await page.waitForTimeout(45); await page.keyboard.up('ArrowRight');
    const before = Number(await hud.getAttribute('data-banish-fx'));
    await page.keyboard.press('Digit1'); await page.waitForTimeout(90);
    found = Number(await hud.getAttribute('data-banish-fx')) > before;
  }
  expect(found).toBe(true); expect(models.has('/models/angel.glb')).toBe(true);
  const before = Number(await hud.getAttribute('data-banish-fx'));
  await page.keyboard.press('Digit2');
  await expect.poll(async () => Number(await telemetry.getAttribute('data-speed')), { timeout: 5000 }).toBeGreaterThan(40);
  await page.screenshot({ path: test.info().outputPath('compact-wing-dive.png') });
  await expect.poll(async () => Number(await hud.getAttribute('data-banish-fx')), { timeout: 5000 }).toBeGreaterThan(before);
  await finishString(page); // the rising cut and the casting blow
  await expect.poll(async () => Number(await hud.getAttribute('data-banished')), { timeout: 10000 }).toBeGreaterThan(0);
  await page.keyboard.up('KeyV'); expect(errors).toEqual([]);
});
