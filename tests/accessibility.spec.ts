import { expect, test, type Page } from '@playwright/test';
import { openSettings, closeAndResume, pauseCard } from './lab-browser';
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
  await openSettings(page);
  await expect(page.getByLabel('Reduced camera motion')).toBeChecked(); await scan();
  // Tap controls sit under the More controls disclosure; scan once with it open.
  await page.getByText('More controls', { exact: true }).click(); await expect(page.getByLabel('Show tap controls')).toBeVisible(); await scan();
  await page.getByLabel('Show tap controls').check(); await closeAndResume(page);
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
    await page.getByRole('button', { name: 'Flight settings', exact: true }).tap();
    await expect(page.getByTestId('touch-settings')).toBeVisible();
    await page.getByTestId('screen-diagnostics').locator('summary').tap();
    await expect(page.getByTestId('screen-diagnostics').getByText('Visual size')).toBeVisible(); await aa(page);
    await closeAndResume(page, true);
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
// Controls (picker 2026-09-28): the header trigger and sheet, the shared list, the fallback buttons and the announcements. Reduced motion, so the
// list glyphs hold still. System Chrome; automated checks are a floor, not a screen-reader session.
const wcag = async (page: Page) => expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([]);
test('Controls on a desktop: the trigger and sheet by keyboard, list radios, fallback buttons and announcements', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.emulateMedia({ reducedMotion: 'reduce' }); await page.goto('/?controls=draw');
  await page.getByRole('button', { name: 'Begin expedition' }).click();
  await expect(page.getByTestId('lab-surface')).toHaveCount(1);
  // The ghost tip is announced through its own polite live region (not the store message, which showed it twice); the ink canvas
  // and surface stay out of the accessibility tree.
  await expect(page.getByTestId('lab-tip-live')).toHaveText(/ink a curve/i);
  await expect(page.locator('main > div.sr-only[aria-live="polite"]').last()).not.toHaveText(/ink a curve/i);
  expect(await page.getByTestId('lab-surface').getAttribute('aria-hidden')).toBe('true');
  await wcag(page);
  // The trigger: a button named by its visible text (2.5.3), at least 44 x 44, announcing the dialog it opens.
  const trigger = page.getByTestId('controls-trigger');
  await expect(trigger).toHaveAccessibleName('Controls: Draw');
  await expect(trigger).toHaveAttribute('aria-haspopup', 'dialog'); await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  { const b = (await trigger.boundingBox())!; expect(b.height).toBeGreaterThanOrEqual(44); expect(b.width).toBeGreaterThanOrEqual(44); }
  // The sheet is a non-modal dialog named Controls; the list is one native radio group and every row is at least 44 px high. Arrow
  // keys move and select (wrapping), and nothing pauses.
  await trigger.focus(); await page.keyboard.press('Enter');
  const sheet = page.getByTestId('controls-sheet');
  await expect(sheet).toHaveRole('dialog'); await expect(sheet).toHaveAccessibleName('Controls'); await expect(sheet).toHaveAttribute('aria-modal', 'false');
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  const list = sheet.getByTestId('controls-list');
  await expect(list).toHaveRole('group'); await expect(list).toHaveAccessibleName('Controls');
  for (const r of await list.getByRole('radio').all()) { const b = (await r.locator('xpath=ancestor::label').boundingBox())!; expect(b.height).toBeGreaterThanOrEqual(44); }
  const radio = (name: RegExp) => list.getByRole('radio', { name });
  await expect(radio(/^Draw/)).toBeChecked(); await expect(radio(/^Draw/)).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(radio(/^Conduct/)).toBeChecked(); await expect(radio(/^Conduct/)).toBeFocused();
  await page.keyboard.press('ArrowDown'); await expect(radio(/^Brush/)).toBeChecked();
  await page.keyboard.press('ArrowDown'); await expect(radio(/^Cursor/)).toBeChecked(); await expect(radio(/^Cursor/)).toBeFocused();
  await expect(page.getByRole('button', { name: 'Pause expedition' })).toBeVisible();
  await wcag(page);
  // Escape closes the sheet, never pauses, and the view of play returns.
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0); await expect(page.getByRole('button', { name: 'Pause expedition' })).toBeVisible();
  await expect(trigger).toHaveAccessibleName('Controls: Cursor');
  // Flight settings has one Controls row, not a second list: the row names the control in use and opens the same sheet (the dialog
  // closes as the sheet opens, the game stays paused). The pause card hides while the sheet shows and returns with focus on its row.
  await page.getByRole('button', { name: 'Pause expedition' }).focus(); await page.keyboard.press('Enter');
  await pauseCard(page).getByRole('button', { name: 'Flight settings', exact: true }).focus(); await page.keyboard.press('Enter');
  const dialog = page.locator('dialog[open]');
  await expect(dialog).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Pause expedition' })).toHaveCount(0);
  await expect(dialog.getByTestId('controls-list')).toHaveCount(0); await expect(dialog.getByTestId('controls-section')).toHaveCount(0);
  const door = dialog.getByTestId('controls-row');
  await expect(door).toHaveAccessibleName('Controls: Cursor'); await expect(door).toHaveAttribute('aria-haspopup', 'dialog');
  { const b = (await door.boundingBox())!; expect(b.height).toBeGreaterThanOrEqual(44); }
  await door.focus(); await page.keyboard.press('Enter');
  await expect(dialog).toHaveCount(0); await expect(sheet).toBeVisible(); await expect(pauseCard(page)).toHaveCount(0);
  await expect(sheet.getByTestId('controls-list').getByRole('radio', { name: /^Cursor/ })).toBeFocused();
  await radio(/^Cursor/).press('ArrowUp'); // wraps to the last: Brush
  await radio(/^Brush/).press('ArrowUp');
  await expect(radio(/^Conduct/)).toBeChecked(); await expect(radio(/^Conduct/)).toBeFocused();
  await wcag(page); // the sheet over the paused game
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0); await expect(pauseCard(page)).toBeVisible();
  await expect(pauseCard(page).getByTestId('controls-row')).toBeFocused(); // focus returns to the door that opened it
  await expect(pauseCard(page).getByTestId('controls-row')).toHaveAccessibleName('Controls: Conduct');
  await pauseCard(page).getByRole('button', { name: 'Flight settings', exact: true }).focus(); await page.keyboard.press('Enter');
  await expect(dialog).toHaveCount(1);
  await wcag(page);
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
  await closeAndResume(page);
  await expect(trigger).toHaveAccessibleName('Controls: Conduct');
  expect(errors).toEqual([]);
});
test('Controls on a phone: play, the pause card row, the sheet over the paused game and the sheet in play satisfy AA checks', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 852, height: 393 }, isMobile: true, hasTouch: true });
  const page = await context.newPage(), errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.emulateMedia({ reducedMotion: 'reduce' }); await page.goto('/?controls=brush');
  await page.getByRole('button', { name: 'Begin expedition' }).tap();
  await expect(page.getByTestId('lab-surface')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Lift', exact: true })).toBeVisible();
  await aa(page);
  await page.getByRole('button', { name: 'Pause expedition' }).tap();
  const card = page.getByRole('region', { name: 'Expedition paused' });
  // The pause card carries one Controls row, not the list: it names the control in use and opens the sheet over the paused game,
  // where the five touch controls are listed. A touch pick closes the sheet and the pause card is back, naming the new control.
  await expect(card.getByTestId('controls-list')).toHaveCount(0);
  await expect(card.getByTestId('controls-row')).toHaveAccessibleName('Controls: Brush');
  await card.getByTestId('controls-row').tap();
  const pausedSheet = page.getByTestId('controls-sheet');
  await expect(pausedSheet).toBeVisible(); await expect(card).toHaveCount(0);
  const list = pausedSheet.getByTestId('controls-list');
  await expect(list.getByRole('radio')).toHaveCount(5);
  await aa(page);
  await list.getByRole('radio', { name: /^Draw/ }).tap();
  await expect(pausedSheet).toHaveCount(0); await expect(card).toBeVisible();
  await expect(card.getByTestId('controls-row')).toHaveAccessibleName('Controls: Draw');
  await aa(page);
  await card.getByRole('button', { name: 'Resume flight' }).tap();
  const trigger = page.getByTestId('controls-trigger');
  await expect(trigger).toHaveAccessibleName('Controls: Draw');
  // A tap on the trigger opens the sheet; a tap on a row switches at once, closes the sheet and keeps playing.
  await trigger.tap();
  const sheet = page.getByTestId('controls-sheet');
  await expect(sheet).toBeVisible(); await aa(page);
  await sheet.getByRole('radio', { name: /^Conduct/ }).tap();
  await expect(sheet).toHaveCount(0);
  await expect(trigger).toHaveAccessibleName('Controls: Conduct');
  await expect(page.getByRole('button', { name: 'Pause expedition' })).toBeVisible();
  await aa(page);
  expect(errors).toEqual([]); await context.close();
});
