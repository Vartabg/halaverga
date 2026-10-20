import { expect, test } from '@playwright/test';
// Arkham-style counter in the real game: hover until a demon winds up its fiery dart, then a strike press counters it in slow
// motion (the vignette shows, the counter count rises) and the ward is not touched by that dart.
test('a strike press during a demon wind-up counters it in slow motion', async ({ page }) => {
  test.setTimeout(90000);
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'Begin expedition' }).click();
  await page.keyboard.press('Space'); await page.waitForTimeout(500); await page.keyboard.press('Space');
  const hud = page.getByTestId('battle-hud'), prompt = page.getByTestId('counter-prompt');
  await expect(prompt).toBeVisible({ timeout: 45000 });
  const ward = await hud.getAttribute('data-ward');
  await page.keyboard.press('KeyC');
  await expect(hud).toHaveAttribute('data-counters', '1');
  await expect(page.locator('[class*="slow"]').first()).toBeAttached();
  await test.info().attach('slow-motion', { body: await page.screenshot(), contentType: 'image/png' });
  await page.waitForTimeout(400);
  expect(Number(await hud.getAttribute('data-ward'))).toBeGreaterThanOrEqual(Number(ward));
  expect(errors).toEqual([]);
});
