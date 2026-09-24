import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { twinTouchPage } from './shooter-browser';
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
// Twin-stick touch (the default on phones), both orientations: play, the pause card with its Home Screen tip, touch settings
// with the screen diagnostics, the Leave card, the zoom note, and play with tap controls on. System Chrome emulation.
const aa = async (page: Page) => expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([]);
for (const viewport of [{ width: 852, height: 393 }, { width: 393, height: 852 }]) {
  test(`twin touch ${viewport.width}x${viewport.height}: play, pause, settings, leave and zoom cards satisfy AA checks`, async ({ browser }) => {
    const t = await twinTouchPage(browser, viewport), { page, cdp } = t;
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await aa(page);
    await page.getByRole('button', { name: 'Pause expedition' }).tap();
    await expect(page.getByText('Tip: Share › Add to Home Screen for full screen.')).toBeVisible(); await aa(page);
    await page.getByRole('button', { name: 'Adjust flight settings' }).tap();
    await expect(page.getByTestId('touch-settings')).toBeVisible();
    await page.getByTestId('screen-diagnostics').locator('summary').tap();
    await expect(page.getByTestId('screen-diagnostics').getByText('Visual size')).toBeVisible(); await aa(page);
    await page.getByRole('button', { name: 'Close dialog' }).tap(); await expect(page.getByRole('button', { name: 'Pause expedition' })).toBeVisible();
    await page.evaluate(() => history.back());
    await expect(page.getByRole('heading', { name: 'Leave the game?' })).toBeVisible(); await aa(page);
    await page.getByRole('button', { name: 'Keep playing' }).tap(); await page.getByRole('button', { name: 'Pause expedition' }).tap();
    const card = (await page.getByRole('region', { name: 'Expedition paused' }).boundingBox())!;
    await cdp.send('Input.synthesizePinchGesture', { x: Math.round(card.x + card.width / 2), y: Math.round(card.y + card.height / 2), scaleFactor: 2, relativeSpeed: 600, gestureSourceType: 'touch' });
    await expect.poll(() => page.evaluate(() => visualViewport!.scale)).toBeGreaterThan(1.5);
    await page.getByRole('button', { name: 'Resume flight' }).dispatchEvent('click');
    await expect(page.getByText('Pinch out to normal size, then tap Resume.')).toBeVisible(); await aa(page);
    expect(t.errors).toEqual([]); await t.context.close();
  });
  test(`twin touch ${viewport.width}x${viewport.height} with tap controls on satisfies AA checks`, async ({ browser }) => {
    const t = await twinTouchPage(browser, viewport, { tapControls: true }), { page } = t;
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(page.getByRole('group', { name: 'Tap flight controls' })).toBeVisible(); await aa(page);
    expect(t.errors).toEqual([]); await t.context.close();
  });
}
