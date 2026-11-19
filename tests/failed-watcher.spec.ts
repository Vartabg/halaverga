import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// docs/plans/2026-11-16-real-fight.md B9 (review finding 12). A watcher.glb that arrives but holds no usable Watcher (here a valid
// GLB with no rig or clips: the arm cannon) fails inside the fight's boundary: the fight turns off and flight continues. A download
// that fails outright is a reloadable world failure instead (tests/hermon-assets.spec.ts).
test('a watcher.glb that cannot be used turns the fight off and flight continues', async ({ page }) => {
  const wrong = await readFile(resolve('public/models/arm-cannon.glb'));
  let served = 0; const faults: string[] = [];
  // shooterFault.ts logs the first fault once; its status message is cleared by the next status change, so the log is the witness.
  page.on('console', m => { if (m.type() === 'error' && m.text().startsWith('[shooter] ')) faults.push(m.text()); });
  await page.route('**/models/watcher.glb', route => { served++; return route.fulfill({ contentType: 'model/gltf-binary', body: wrong }); });
  await page.goto('/');
  await page.getByRole('button', { name: 'Ascend Mount Hermon' }).click();
  await expect.poll(() => faults.length, { timeout: 15000 }).toBeGreaterThan(0);
  expect(faults[0]).toMatch(/^\[shooter\] render/); expect(served).toBeGreaterThan(0);
  await expect(page.getByRole('heading', { name: 'The world needs a moment.' })).toHaveCount(0);
  await expect(page.getByTestId('shooter-hud')).toHaveCount(0);
  // Space on a focused button would press it, so return focus to the game first (as tests/suit-clips.spec.ts).
  await page.getByRole('main', { name: 'Halaverga expedition' }).focus(); await page.keyboard.press('Space');
  const telemetry = page.getByTestId('flight-telemetry');
  await expect(telemetry).toHaveAttribute('data-flying', 'true');
  await page.keyboard.down('KeyW'); await expect.poll(async () => Number(await telemetry.getAttribute('data-speed'))).toBeGreaterThan(2);
  await page.keyboard.up('KeyW');
});
