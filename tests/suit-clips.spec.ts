import { expect, test, type Page } from '@playwright/test';
// The authored flight clip on show, read from the telemetry label that samples the suit every 350 ms. Braking is not asserted here:
// its label lasts about .3 s, shorter than the sample; unit tests and the review strips cover it.
const settings = async (page: Page, change: () => Promise<void>) => {
  await page.getByRole('button', { name: 'Flight settings' }).click(); await change();
  await page.getByRole('button', { name: 'Close dialog' }).click();
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
  await page.keyboard.down('KeyW'); await page.keyboard.press('Shift'); await clip('power');
  await page.keyboard.up('KeyW');
  await settings(page, () => page.getByLabel('Reduced camera motion').check());
  await page.keyboard.down('KeyW'); await clip('cruise'); await page.keyboard.press('Shift'); await clip('power'); await page.keyboard.up('KeyW');
  await page.getByRole('button', { name: 'Flight settings' }).click();
  await page.getByRole('button', { name: 'Return to arrival terrace' }).click();
  await expect(telemetry).toHaveAttribute('data-flying', 'false'); await clip('ground');
  expect(errors).toEqual([]);
});
