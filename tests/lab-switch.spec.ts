import { expect, test, type Page } from '@playwright/test';
import { droneIn, labPage, lift, shots, tel } from './lab-browser';
// Gesture Lab switching (spec 8, bar 2026-09-25): Standard stays the default; ?controls= is a session override; the header bar
// (Standard · Draw · Conduct · Brush) shows in every scheme and switches at once without pausing; the pause card and Flight
// settings keep the full picker and the rating; a switch mid-action leaves no stuck movement or fire. Non-touch desktop, system Chrome.
const saved = (p: Page) => p.evaluate(() => JSON.parse(localStorage.getItem('halaverga-flight-v1') || '{}'));
const controls = (p: Page) => p.evaluate(() => document.documentElement.dataset.controls ?? null);
const bar = (p: Page) => p.getByTestId('lab-bar');
const segment = (p: Page, name: string) => bar(p).getByRole('radio', { name, exact: true });
const checkedIs = (p: Page, name: string) => expect(segment(p, name)).toHaveAttribute('aria-checked', 'true');

test('Standard is the default: the free-cursor surface, no lab surface or data-controls, and the bar shows Standard', async ({ browser }) => {
  const t = await labPage(browser, 'standard'), { page } = t;
  await expect(page.getByTestId('flight-surface')).toHaveCount(1);
  await expect(page.getByTestId('lab-surface')).toHaveCount(0);
  await expect(bar(page)).toBeVisible();
  await expect(bar(page)).toHaveAccessibleName('Controls');
  await checkedIs(page, 'Standard');
  expect(await controls(page)).toBeNull();
  await expect(page.locator('[class*="trackpadHint"]')).toHaveText('SPACE TO FLY · CLICK TO FIRE · DRAG TO LOOK');
  expect(t.errors).toEqual([]); await t.context.close();
});

test('?controls=draw is this session only: the lab replaces the standard layers and is not saved', async ({ browser }) => {
  const t = await labPage(browser, 'draw'), { page } = t;
  expect(await controls(page)).toBe('draw');
  await expect(page.getByTestId('flight-surface')).toHaveCount(0);
  await checkedIs(page, 'Draw');
  await expect(page.locator('[class*="trackpadHint"]')).toHaveCount(0);
  await expect(page.locator('[class*="reticle"]')).toBeHidden();
  // Lift/Land stays available in every lab scheme.
  await expect(page.getByRole('button', { name: 'Lift', exact: true })).toBeVisible();
  // A reload saves on pagehide: the saved choice is still Standard, and a plain URL starts in Standard.
  await page.reload(); await expect(page.getByRole('button', { name: 'Begin expedition' })).toBeVisible();
  expect((await saved(page)).controlLab ?? 'standard').toBe('standard');
  await page.goto('/'); await page.getByRole('button', { name: 'Begin expedition' }).click();
  await expect(page.getByTestId('flight-surface')).toHaveCount(1);
  expect(await controls(page)).toBeNull();
  expect(t.errors).toEqual([]); await t.context.close();
});

test('the bar switches at once without pausing; settings and the pause card keep the picker, keyboard radios and rating', async ({ browser }) => {
  const t = await labPage(browser, 'conduct'), { page } = t;
  // One click on the bar: Brush at once, still playing, saved, and the click took no focus (Space keeps flying).
  await segment(page, 'Brush').click();
  await checkedIs(page, 'Brush');
  expect(await controls(page)).toBe('brush');
  expect((await saved(page)).controlLab).toBe('brush');
  await expect(page.getByRole('button', { name: 'Pause expedition' })).toBeVisible();
  await expect(page.getByTestId('lab-surface')).toHaveCount(1);
  await expect(segment(page, 'Brush')).not.toBeFocused();
  await expect(page.getByRole('region', { name: 'Expedition paused' })).toHaveCount(0);
  // Picking the current scheme does nothing.
  await segment(page, 'Brush').click(); await checkedIs(page, 'Brush');
  // Flight settings keeps the full picker: arrow keys move and select within the native group, with an optional rating.
  await page.getByRole('button', { name: 'Flight settings' }).click();
  const dialog = page.locator('dialog[open]');
  await expect(dialog).toHaveCount(1);
  await expect(page.getByTestId('lab-surface')).toHaveCount(0); // paused: the lab controls are unmounted
  const picker = dialog.getByTestId('lab-picker');
  await expect(picker.getByRole('radio', { name: /^Brush/ })).toBeChecked();
  await picker.getByRole('radio', { name: /^Brush/ }).focus();
  await page.keyboard.press('ArrowUp');
  await expect(picker.getByRole('radio', { name: /^Conduct/ })).toBeChecked();
  await expect(picker.getByRole('radio', { name: /^Conduct/ })).toBeFocused();
  expect(await controls(page)).toBe('conduct');
  // The rating of the scheme just left is optional: Skip closes it with nothing recorded.
  const rating = dialog.getByRole('region', { name: 'Rate Brush' });
  await expect(rating).toBeVisible();
  await rating.getByRole('button', { name: 'Skip' }).click();
  await expect(rating).toHaveCount(0);
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await expect(page.getByRole('button', { name: 'Pause expedition' })).toBeVisible();
  await expect(page.getByTestId('lab-surface')).toHaveCount(1);
  await checkedIs(page, 'Conduct');
  await segment(page, 'Brush').click(); await checkedIs(page, 'Brush');

  // The pause card carries the same picker: Escape pauses (nothing is being drawn), ArrowUp picks Conduct, Resume plays it.
  await page.keyboard.press('Escape');
  const card = page.getByRole('region', { name: 'Expedition paused' });
  await expect(card).toBeVisible();
  await card.getByRole('radio', { name: /^Brush/ }).focus();
  await page.keyboard.press('ArrowUp');
  await expect(card.getByRole('radio', { name: /^Conduct/ })).toBeChecked();
  await expect(card.getByRole('region', { name: 'Rate Brush' })).toBeVisible();
  // Back to Standard from the same picker, then Resume: the standard surface returns and the choice is saved.
  await card.getByRole('radio', { name: /^Standard/ }).check();
  await card.getByRole('button', { name: 'Resume flight' }).click();
  await expect(page.getByTestId('flight-surface')).toHaveCount(1);
  await checkedIs(page, 'Standard');
  expect(await controls(page)).toBeNull();
  expect((await saved(page)).controlLab).toBe('standard');
  expect(t.errors).toEqual([]); await t.context.close();
});

test('a switch mid-cruise or mid-blast leaves no stuck movement or fire', async ({ browser }) => {
  const t = await labPage(browser, 'conduct'), { page } = t;
  const card = page.getByRole('region', { name: 'Expedition paused' });
  await lift(page);
  // Conduct cruise (a click on empty sky near the centre), then Escape (nothing is being drawn, so it pauses) and Draw by keyboard.
  await page.mouse.click(720, 300);
  await expect.poll(async () => (await tel(page)).speed).toBeGreaterThan(1.5);
  await page.keyboard.press('Escape'); await expect(card).toBeVisible();
  await card.getByRole('radio', { name: /^Conduct/ }).focus(); await page.keyboard.press('ArrowUp');
  await expect(card.getByRole('radio', { name: /^Draw/ })).toBeChecked();
  await card.getByRole('button', { name: 'Resume flight' }).click();
  await checkedIs(page, 'Draw');
  await expect.poll(async () => (await tel(page)).speed, { timeout: 5000 }).toBeLessThan(.3);

  // In Draw, press and hold on a drone: sustained aimed fire. Escape pauses mid-blast, Brush is picked, the button comes up off
  // the surface, and Resume leaves the trigger released.
  const d = await droneIn(page, { x0: 200, y0: 150, x1: 1240, y1: 800 });
  test.skip(!d, 'no drone in view from the lift point');
  const before = await shots(page);
  await page.mouse.move(d!.x, d!.y); await page.mouse.down(); await page.waitForTimeout(500);
  await expect.poll(() => shots(page)).toBeGreaterThan(before);
  await page.keyboard.press('Escape'); await expect(card).toBeVisible();
  await card.getByRole('radio', { name: /^Draw/ }).focus(); await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown');
  await expect(card.getByRole('radio', { name: /^Brush/ })).toBeChecked();
  await page.mouse.up();
  await card.getByRole('button', { name: 'Resume flight' }).click();
  await checkedIs(page, 'Brush');
  await page.waitForTimeout(500); const settled = await shots(page);
  await page.waitForTimeout(1200); expect(await shots(page)).toBe(settled);
  // Brush mounted in the air does not cruise until the first stroke.
  expect((await tel(page)).speed).toBeLessThan(.3); expect((await tel(page)).flying).toBe(true);
  expect(t.errors).toEqual([]); await t.context.close();
});

test('a bar switch mid-cruise stops the cruise; keys 1-4 switch while playing and while paused (paused stays paused)', async ({ browser }) => {
  const t = await labPage(browser, 'conduct'), { page } = t;
  await lift(page);
  await page.mouse.click(720, 300);
  await expect.poll(async () => (await tel(page)).speed).toBeGreaterThan(1.5);
  await segment(page, 'Draw').click();
  await checkedIs(page, 'Draw');
  await expect.poll(async () => (await tel(page)).speed, { timeout: 5000 }).toBeLessThan(.3);
  await page.keyboard.press('Digit4'); await checkedIs(page, 'Brush'); expect(await controls(page)).toBe('brush');
  await page.keyboard.press('Escape');
  const card = page.getByRole('region', { name: 'Expedition paused' });
  await expect(card).toBeVisible();
  await page.keyboard.press('Digit1'); await checkedIs(page, 'Standard');
  await expect(card).toBeVisible();
  expect(await controls(page)).toBeNull();
  expect(t.errors).toEqual([]); await t.context.close();
});
