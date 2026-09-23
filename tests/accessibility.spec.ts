import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
test('entry, field guide and settings satisfy automated AA checks', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); await page.goto('/');
  await expect(page.getByRole('button', { name: 'Begin expedition' })).toBeEnabled();
  await expect(page.locator('h1')).toHaveCount(1); await expect(page.locator('main')).toHaveCount(1);
  await page.keyboard.press('Tab'); await expect(page.getByText('Skip to text field guide')).toBeFocused();
  const scan = async () => expect((await new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze()).violations).toEqual([]);
  await scan(); await page.keyboard.press('Enter'); await expect(page.getByRole('dialog')).toBeVisible(); await scan();
  await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Begin expedition' }).click();
  await page.getByRole('button', { name: 'Flight settings' }).click();
  await expect(page.getByLabel('Reduced camera motion')).toBeChecked(); await scan();
  // Tap controls sit under the More controls disclosure; scan once with it open.
  await page.getByText('More controls', { exact: true }).click(); await expect(page.getByLabel('Show tap controls')).toBeVisible(); await scan();
  await page.getByLabel('Show tap controls').check(); await page.getByRole('button', { name: 'Close dialog' }).click();
  await scan(); await page.getByRole('button', { name: 'Lift', exact: true }).click();
  await expect(page.getByTestId('flight-telemetry')).toHaveAttribute('data-flying', 'true');
  await page.getByRole('button', { name: 'Move forward', exact: true }).click(); await page.waitForTimeout(1000);
  const position = JSON.parse((await page.getByTestId('flight-telemetry').getAttribute('data-position'))!);
  expect(position[2]).toBeLessThan(64.9);
  await page.getByRole('button', { name: 'Stop movement', exact: true }).click();
  await page.waitForTimeout(400); expect(Number(await page.getByTestId('flight-telemetry').getAttribute('data-speed'))).toBeLessThan(.2);
});
