import { expect, test, type Page } from '@playwright/test';
// The authored flight clip on show, read from the telemetry label that samples the suit every 350 ms. Braking is not asserted here:
// its label lasts about .3 s, shorter than the sample; unit tests and the review strips cover it.
// Each settings change also returns to the arrival terrace and takes off again, so every segment starts from the same place
// instead of flying on into the city, where collision handling would steer (bank) or stop (brake) the explorer.
const settings = async (page: Page, change: () => Promise<void>) => {
  const telemetry = page.getByTestId('flight-telemetry');
  await page.getByRole('button', { name: 'Flight settings' }).click(); await change();
  await page.getByRole('button', { name: 'Return to arrival terrace' }).click();
  // Closing the panel resumes only once the scene is ready; otherwise the pause screen offers Resume flight. Keys are ignored while paused.
  const playing = page.getByRole('button', { name: 'Pause expedition' }), resume = page.getByRole('button', { name: 'Resume flight' });
  await expect(playing.or(resume)).toBeVisible();
  if (await resume.isVisible()) { await expect(resume).toBeEnabled({ timeout: 10000 }); await resume.click(); }
  await expect(playing).toBeVisible(); await expect(telemetry).toHaveAttribute('data-flying', 'false');
  // Space on a focused button would press it, so return focus to the game first.
  await page.getByRole('main', { name: 'Halaverga expedition' }).focus(); await page.keyboard.press('Space'); await expect(telemetry).toHaveAttribute('data-flying', 'true');
  await page.keyboard.down('KeyW'); await expect.poll(async () => Number(await telemetry.getAttribute('data-speed'))).toBeGreaterThan(2);
};
test('the suit plays its authored flight clips and hands back to the ground', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/'); await page.getByRole('button', { name: 'Begin expedition' }).click();
  const telemetry = page.getByTestId('flight-telemetry'), clip = (name: string) => expect(telemetry).toHaveAttribute('data-suit-clip', name, { timeout: 3000 });
  await clip('ground');
  await page.keyboard.press('Space'); await expect(telemetry).toHaveAttribute('data-flying', 'true'); await clip('hover');
  await page.keyboard.down('KeyW'); await clip('cruise');
  await page.keyboard.down('ArrowLeft'); await clip('bank-left'); await page.keyboard.up('ArrowLeft'); await clip('cruise');
  await page.keyboard.down('ArrowRight'); await clip('bank-right'); await page.keyboard.up('ArrowRight'); await clip('cruise');
  await page.keyboard.press('Shift'); await clip('power-hero');
  // Pausing clears held keys and surge; resume with classic poses.
  await page.keyboard.up('KeyW');
  await settings(page, () => page.getByLabel('Expressive hero poses').uncheck());
  await page.keyboard.press('Shift'); await clip('power');
  await page.keyboard.up('KeyW');
  await settings(page, () => page.getByLabel('Reduced camera motion').check());
  await clip('cruise'); await page.keyboard.press('Shift'); await clip('power'); await page.keyboard.up('KeyW');
  await page.getByRole('button', { name: 'Flight settings' }).click();
  await page.getByRole('button', { name: 'Return to arrival terrace' }).click();
  await expect(telemetry).toHaveAttribute('data-flying', 'false'); await clip('ground');
  expect(errors).toEqual([]);
});
