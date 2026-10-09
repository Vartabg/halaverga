import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('district download failure recovers through Reload scene', async ({ page }) => {
  let fail = true;
  await page.route('**/models/environment/meridian-district.glb', route => fail ? route.abort() : route.continue());
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'The world needs a moment.' })).toBeVisible();
  fail = false;
  await page.getByRole('button', { name: 'Reload scene' }).click();
  await page.getByRole('button', { name: 'Begin expedition' }).click();
  await page.keyboard.press('Space');
  await expect(page.getByTestId('flight-telemetry')).toHaveAttribute('data-flying', 'true');
});

test('reflection resources settle after repeated high/low quality switches', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('/');
  await page.getByRole('button', { name: 'Begin expedition' }).click();
  const resources: { geometries: number; textures: number }[] = [];
  for (const quality of ['high', 'low', 'high', 'low', 'high']) {
    await page.getByRole('button', { name: 'Flight settings' }).click();
    await page.getByRole('combobox', { name: 'Graphics', exact: true }).selectOption(quality);
    await page.getByRole('button', { name: 'Close dialog' }).click();
    await page.waitForTimeout(600);
    await page.getByRole('button', { name: 'Flight settings' }).click();
    await page.getByText('Playtest measurements', { exact: true }).click();
    const pending = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download measurements' }).click();
    const download = await pending;
    resources.push(JSON.parse(await readFile((await download.path())!, 'utf8')).resources);
    await page.getByRole('button', { name: 'Close dialog' }).click();
  }
  expect(resources[4]).toEqual(resources[2]);
  expect(resources[3]).toEqual(resources[1]);
  expect(resources[4].textures).toBeGreaterThan(resources[3].textures);
  expect(errors).toEqual([]);
});
