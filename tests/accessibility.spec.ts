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
// Gesture Lab (spec 7-9, bar 2026-09-25): the header bar, the pickers, the rating, the fallback buttons and the announcements. Reduced motion, so the
// picker glyphs hold still. System Chrome; automated checks are a floor, not a screen-reader session.
const wcag = async (page: Page) => expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([]);
test('Gesture Lab on a desktop: the bar by keyboard, picker radios, rating, fallback buttons and announcements', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.emulateMedia({ reducedMotion: 'reduce' }); await page.goto('/?controls=draw');
  await page.getByRole('button', { name: 'Begin expedition' }).click();
  await expect(page.getByTestId('lab-surface')).toHaveCount(1);
  // The ghost tip is announced through the polite live region; the ink canvas and surface stay out of the accessibility tree.
  await expect(page.locator('main > div.sr-only[aria-live="polite"]').last()).toHaveText(/ink a curve/i);
  expect(await page.getByTestId('lab-surface').getAttribute('aria-hidden')).toBe('true');
  await wcag(page);
  // The bar: one radio group named "Controls", segments named by their visible text (2.5.3) and at least 44 x 44. APG radios:
  // only the checked one is in the tab order, arrows move and select (wrapping), Home and End jump, and nothing pauses.
  const bar = page.getByTestId('lab-bar');
  await expect(bar).toHaveRole('radiogroup'); await expect(bar).toHaveAccessibleName('Controls');
  const seg = (name: string) => bar.getByRole('radio', { name, exact: true });
  for (const r of await bar.getByRole('radio').all()) { const b = (await r.boundingBox())!; expect(b.height).toBeGreaterThanOrEqual(44); expect(b.width).toBeGreaterThanOrEqual(44); }
  await expect(seg('Draw')).toHaveAttribute('aria-checked', 'true');
  await expect(seg('Draw')).toHaveAttribute('tabindex', '0'); await expect(seg('Conduct')).toHaveAttribute('tabindex', '-1');
  await seg('Draw').focus(); await page.keyboard.press('ArrowRight');
  await expect(seg('Conduct')).toHaveAttribute('aria-checked', 'true'); await expect(seg('Conduct')).toBeFocused();
  await page.keyboard.press('End'); await expect(seg('Brush')).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('ArrowRight'); await expect(seg('Standard')).toHaveAttribute('aria-checked', 'true'); await expect(seg('Standard')).toBeFocused();
  await page.keyboard.press('Home'); await page.keyboard.press('ArrowRight'); await expect(seg('Draw')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('button', { name: 'Pause expedition' })).toBeVisible();
  await wcag(page);
  // Flight settings keeps the full picker (the bar never opens it).
  await page.getByRole('button', { name: 'Flight settings' }).focus(); await page.keyboard.press('Enter');
  const dialog = page.locator('dialog[open]');
  await expect(dialog).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Pause expedition' })).toHaveCount(0);
  // The picker is a native radio group with a legend; arrow keys select.
  const picker = dialog.getByTestId('lab-picker');
  await expect(picker).toHaveRole('group'); await expect(picker).toHaveAccessibleName('Control lab');
  await picker.getByRole('radio', { name: /^Draw/ }).focus(); await page.keyboard.press('ArrowDown');
  await expect(picker.getByRole('radio', { name: /^Conduct/ })).toBeChecked();
  await expect(dialog.getByRole('region', { name: 'Rate Draw' })).toBeVisible();
  await wcag(page);
  await dialog.getByRole('region', { name: 'Rate Draw' }).getByRole('button', { name: 'Skip' }).click();
  // Conduct's fallback buttons under More controls: every one at least 44 x 44, and a press is confirmed in a status line.
  const group = dialog.getByRole('group', { name: 'Lab actions' });
  await expect(group).toBeVisible();
  const names = await group.getByRole('button').allTextContents();
  expect(names).toEqual(['Faster', 'Slower', 'Dash', 'Roll left', 'Roll right', 'Brake']);
  for (const b of await group.getByRole('button').all()) { const r = (await b.boundingBox())!; expect(r.height).toBeGreaterThanOrEqual(44); expect(r.width).toBeGreaterThanOrEqual(44); }
  await group.getByRole('button', { name: 'Faster' }).click();
  await expect(group.getByRole('status')).toHaveText('Faster when flight resumes.');
  // The lab measurements table (a scrollable region, reachable by keyboard).
  await dialog.getByTestId('lab-stats').locator('summary').click();
  await expect(dialog.getByRole('region', { name: 'Control lab measurements table' })).toHaveAttribute('tabindex', '0');
  await wcag(page);
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await expect(seg('Conduct')).toHaveAttribute('aria-checked', 'true');
  expect(errors).toEqual([]);
});
test('Gesture Lab on a phone: play, and the pause card with its picker and rating, satisfy AA checks', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 852, height: 393 }, isMobile: true, hasTouch: true });
  const page = await context.newPage(), errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.emulateMedia({ reducedMotion: 'reduce' }); await page.goto('/?controls=brush');
  await page.getByRole('button', { name: 'Begin expedition' }).tap();
  await expect(page.getByTestId('lab-surface')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Lift', exact: true })).toBeVisible();
  await aa(page);
  await page.getByRole('button', { name: 'Pause expedition' }).tap();
  const card = page.getByRole('region', { name: 'Expedition paused' });
  await expect(card.getByTestId('lab-picker')).toBeVisible();
  await card.getByRole('radio', { name: /^Draw/ }).tap();
  await expect(card.getByRole('region', { name: 'Rate Brush' })).toBeVisible();
  await aa(page);
  // A rating needs at least one answer before Save; both questions may be skipped.
  const rating = card.getByRole('region', { name: 'Rate Brush' });
  await expect(rating.getByRole('button', { name: 'Save rating' })).toBeDisabled();
  await rating.getByRole('group', { name: 'How in control?' }).getByRole('radio', { name: '4' }).tap();
  await rating.getByRole('button', { name: 'Save rating' }).tap();
  await expect(rating).toHaveCount(0);
  await card.getByRole('button', { name: 'Resume flight' }).tap();
  const bar = page.getByTestId('lab-bar');
  await expect(bar.getByRole('radio', { name: 'Draw', exact: true })).toHaveAttribute('aria-checked', 'true');
  // A tap on the bar switches at once and keeps playing.
  await bar.getByRole('radio', { name: 'Conduct', exact: true }).tap();
  await expect(bar.getByRole('radio', { name: 'Conduct', exact: true })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('button', { name: 'Pause expedition' })).toBeVisible();
  await aa(page);
  expect(errors).toEqual([]); await context.close();
});
