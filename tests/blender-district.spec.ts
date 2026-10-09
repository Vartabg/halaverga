import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { openSettings, closeAndResume } from './lab-browser';

test('the storm district and default arm cannon load together and shooting works', async ({ page }) => {
  const loaded = new Set<string>();
  page.on('response', r => { if (r.ok() && r.url().endsWith('.glb')) loaded.add(new URL(r.url()).pathname); });
  await page.goto('/');
  await page.getByRole('button', { name: 'Begin expedition' }).click();
  const hud = page.getByTestId('shooter-hud');
  await expect(hud).toHaveAttribute('data-cannon', 'shown');
  await page.keyboard.down('KeyC');
  await expect.poll(async () => Number(await hud.getAttribute('data-shots'))).toBeGreaterThan(2);
  await page.keyboard.up('KeyC');
  expect(loaded.has('/models/environment/meridian-district.glb')).toBe(true);
  expect(loaded.has('/models/arm-cannon.glb')).toBe(true);
});

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
    await openSettings(page);
    await page.getByRole('combobox', { name: 'Graphics', exact: true }).selectOption(quality);
    await closeAndResume(page);
    await page.waitForTimeout(600);
    await openSettings(page);
    await page.getByText('Playtest measurements', { exact: true }).click();
    const pending = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download measurements' }).click();
    const download = await pending;
    resources.push(JSON.parse(await readFile((await download.path())!, 'utf8')).resources);
    await closeAndResume(page);
  }
  expect(resources[4]).toEqual(resources[2]);
  expect(resources[3]).toEqual(resources[1]);
  expect(resources[4].textures).toBeGreaterThan(resources[3].textures);
  expect(errors).toEqual([]);
});
