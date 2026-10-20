import { expect, test } from '@playwright/test';

test('the biblical fantasy entry, accessible source distinction and battle objective agree', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  const models = new Set<string>(); page.on('response', r => { if (r.ok() && r.url().endsWith('.glb')) models.add(new URL(r.url()).pathname); });
  await page.goto('/');
  await expect(page).toHaveTitle('Halaverga — War in Heaven');
  await expect(page.getByRole('heading', { name: 'Heaven at war.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Begin expedition' })).toBeEnabled();
  await test.info().attach('sanctuary-entry', { body: await page.screenshot(), contentType: 'image/png' });
  await page.getByRole('button', { name: 'Field guide', exact: true }).click();
  await expect(page.getByText(/The holy wheels draw on Ezekiel/)).toBeVisible();
  await page.getByRole('button', { name: 'Read the scripture tablet' }).click();
  await expect(page.getByText('Quoted source · Revelation 12:7', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByRole('button', { name: 'Begin expedition' }).click();
  await expect(page.getByTestId('battle-hud')).toHaveAttribute('data-ward', '3');
  await page.keyboard.press('Space');
  await expect(page.getByTestId('flight-telemetry')).toHaveAttribute('data-flying', 'true');
  // No bracer shots (docs/research/combat-texts.md): C is the next step on the demon under the reticle, and never fires.
  await expect(page.getByLabel('Combat strokes')).toContainText('Click or C: strike / chain');
  // Once the press has been processed (every command counts as one attempt), the bracer has not fired: the weapon never heated,
  // no arm cannon is mounted, and its model was never downloaded.
  const hud = page.getByTestId('shooter-hud');
  await page.keyboard.press('KeyC');
  await expect.poll(async () => Number(await hud.getAttribute('data-shots'))).toBeGreaterThan(0);
  await page.waitForTimeout(300);
  await expect(hud).toHaveAttribute('data-heat', '0'); await expect(hud).toHaveAttribute('data-cannon', 'none');
  expect(models.has('/models/arm-cannon.glb')).toBe(false);
  expect(errors).toEqual([]);
});

for (const viewport of [{ width: 393, height: 852 }, { width: 852, height: 393 }]) {
  test(`the celestial entry and ward remain usable at ${viewport.width}x${viewport.height}`, async ({ browser }) => {
    const context = await browser.newContext({ viewport, isMobile: true, hasTouch: true });
    try {
      const page = await context.newPage(), errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
      await page.emulateMedia({ reducedMotion: 'reduce' }); await page.goto('/');
      const begin = page.getByRole('button', { name: 'Begin expedition' }); await expect(begin).toBeEnabled();
      await expect(page.getByText('Drag to fly · tap demons to strike.', { exact: true })).toBeVisible();
      const button = (await begin.boundingBox())!; expect(button.x).toBeGreaterThanOrEqual(0);
      expect(button.x + button.width).toBeLessThanOrEqual(viewport.width); expect(button.y + button.height).toBeLessThanOrEqual(viewport.height);
      await test.info().attach('entry', { body: await page.screenshot(), contentType: 'image/png' });
      await begin.tap(); await expect(page.getByTestId('battle-hud')).toBeVisible();
      await test.info().attach('battle', { body: await page.screenshot(), contentType: 'image/png' });
      expect(errors).toEqual([]);
    } finally { await context.close(); }
  });
}

test('incoming fire breaks a stationary ward, then regroup restores the player and encounter', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Begin expedition' }).click();
  await page.keyboard.press('Space'); await page.waitForTimeout(500); await page.keyboard.press('Space');
  await expect(page.getByTestId('flight-telemetry')).toHaveAttribute('data-flying', 'true');
  await expect(page.getByRole('heading', { name: 'Your ward is broken' })).toBeVisible({ timeout: 45000 });
  await page.getByRole('button', { name: 'Regroup at the sanctuary' }).click();
  await expect(page.getByTestId('battle-hud')).toHaveAttribute('data-ward', '3');
  await expect(page.getByTestId('battle-hud')).toHaveAttribute('data-banished', '0');
  await expect(page.getByTestId('flight-telemetry')).toHaveAttribute('data-flying', 'false');
});
