import { expect, test } from '@playwright/test';
import { controlName } from './controls-browser';
import { droneIn, labPage, lift, shots, tel, openSettings, resumeFromCard, settingsCurrent } from './lab-browser';
import { controlId, openSheet, paused, row, saved, sheet, trigger } from './controls-browser';
// Control switching (spec 8, controls picker 2026-09-28): Cursor stays the desktop default; ?controls= is a session override; the
// header trigger 'Controls: <label>' opens one sheet listing every control of the family (switch at once, never pause); the pause card
// and Flight settings each have a Controls row that opens that same sheet over the paused game; a switch mid-action leaves no stuck
// movement or fire. Non-touch desktop, system Chrome.
const controls = (p: import('@playwright/test').Page) => p.evaluate(() => document.documentElement.dataset.controls ?? null);
const list = (root: import('@playwright/test').Locator) => root.getByTestId('controls-list');
const radio = (root: import('@playwright/test').Locator, name: RegExp) => list(root).getByRole('radio', { name });
const isCurrent = (p: import('@playwright/test').Page, label: string) => expect(trigger(p)).toHaveAccessibleName(controlName(label));

test('Cursor is the default: the free-cursor surface, no lab surface or data-controls, and the trigger names it', async ({ browser }) => {
  const t = await labPage(browser, 'standard'), { page } = t;
  await expect(page.getByTestId('flight-surface')).toHaveCount(1);
  await expect(page.getByTestId('lab-surface')).toHaveCount(0);
  await expect(trigger(page)).toBeVisible();
  await expect(trigger(page)).toHaveAccessibleName(controlName('Cursor'));
  await expect(trigger(page)).toHaveAttribute('aria-haspopup', 'dialog');
  await isCurrent(page, 'Cursor');
  expect(await controls(page)).toBeNull();
  expect(await controlId(page)).toBe('cursor');
  await expect(page.locator('[class*="trackpadHint"]')).toHaveText('SPACE TO FLY · CLICK TO FIRE · DRAG TO LOOK');
  expect(t.errors).toEqual([]); await t.context.close();
});

test('?controls=draw is this session only: the lab replaces the standard layers and is not saved', async ({ browser }) => {
  const t = await labPage(browser, 'draw'), { page } = t;
  expect(await controls(page)).toBe('draw');
  await expect(page.getByTestId('flight-surface')).toHaveCount(0);
  await isCurrent(page, 'Draw');
  await expect(page.locator('[class*="trackpadHint"]')).toHaveCount(0);
  await expect(page.locator('[class*="reticle"]')).toBeHidden();
  // Lift/Land stays available in every lab scheme.
  await expect(page.getByRole('button', { name: 'Lift', exact: true })).toBeVisible();
  // A reload saves on pagehide: the saved choice is still Standard, and a plain URL starts in Cursor.
  await page.reload(); await expect(page.getByRole('button', { name: 'Begin expedition' })).toBeVisible();
  expect((await saved(page)).controlLab ?? 'standard').toBe('standard');
  await page.goto('/'); await page.getByRole('button', { name: 'Begin expedition' }).click();
  await expect(page.getByTestId('flight-surface')).toHaveCount(1);
  expect(await controls(page)).toBeNull();
  expect(t.errors).toEqual([]); await t.context.close();
});

test('the sheet switches at once without pausing; settings and the pause card open the same sheet from their Controls row, with keyboard radios', async ({ browser }) => {
  const t = await labPage(browser, 'conduct'), { page } = t;
  // One click on a sheet row: Brush at once, still playing, saved.
  await openSheet(page);
  await row(page, 'brush').click();
  await isCurrent(page, 'Brush');
  expect(await controls(page)).toBe('brush');
  expect((await saved(page)).controlLab).toBe('brush');
  await expect(page.getByRole('button', { name: 'Pause expedition' })).toBeVisible();
  await expect(page.getByTestId('lab-surface')).toHaveCount(1);
  await expect(paused(page)).toHaveCount(0);
  // Picking the current control does nothing.
  await row(page, 'brush').click(); await isCurrent(page, 'Brush');
  expect(await controls(page)).toBe('brush');
  // Escape closes the sheet and never pauses.
  await page.keyboard.press('Escape');
  await expect(sheet(page)).toHaveCount(0);
  await expect(paused(page)).toHaveCount(0);
  // Flight settings has a Controls row (no second list) that names the control in use and opens the same sheet: arrow keys move and
  // select within the native group, the game stays paused, and the pause card is back when the sheet closes.
  await openSettings(page);
  const dialog = page.locator('dialog[open]');
  await expect(dialog).toHaveCount(1);
  await expect(page.getByTestId('lab-surface')).toHaveCount(0); // paused: the lab controls are unmounted
  await expect(list(dialog)).toHaveCount(0);
  expect(await settingsCurrent(page)).toBe('brush');
  await dialog.getByTestId('controls-row').click();
  await expect(dialog).toHaveCount(0); await expect(sheet(page)).toBeVisible(); await expect(paused(page)).toHaveCount(0);
  await expect(radio(sheet(page), /^Brush/)).toBeChecked();
  await expect(radio(sheet(page), /^Brush/)).toBeFocused(); // focus opens on the checked row
  await page.keyboard.press('ArrowUp');
  await expect(radio(sheet(page), /^Conduct/)).toBeChecked();
  await expect(radio(sheet(page), /^Conduct/)).toBeFocused();
  expect(await controls(page)).toBe('conduct');
  await page.keyboard.press('Escape'); // closes only the sheet: still paused, the pause card is back with focus on its Controls row
  await expect(sheet(page)).toHaveCount(0); await expect(paused(page)).toBeVisible();
  await expect(paused(page).getByTestId('controls-row')).toBeFocused();
  await resumeFromCard(page);
  await expect(page.getByTestId('lab-surface')).toHaveCount(1);
  await isCurrent(page, 'Conduct');
  await openSheet(page); await row(page, 'brush').click(); await isCurrent(page, 'Brush');
  await page.keyboard.press('Escape');

  // The pause card's Controls row opens the same sheet: Escape pauses (nothing is being drawn), the row opens the sheet over the paused
  // game, ArrowUp picks Conduct, and a click picks Cursor; closing returns to the card and Resume plays the choice.
  await page.keyboard.press('Escape');
  const card = paused(page);
  await expect(card).toBeVisible();
  await expect(list(card)).toHaveCount(0);
  await card.getByTestId('controls-row').click();
  await expect(sheet(page)).toBeVisible(); await expect(card).toHaveCount(0);
  await expect(radio(sheet(page), /^Brush/)).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(radio(sheet(page), /^Conduct/)).toBeChecked();
  // Back to Cursor from the same list, then Resume: the standard surface returns and the choice is saved.
  await row(page, 'cursor').click(); await expect(radio(sheet(page), /^Cursor/)).toBeChecked();
  await page.keyboard.press('Escape'); await expect(sheet(page)).toHaveCount(0); await expect(card).toBeVisible();
  await expect(card.getByTestId('controls-row')).toHaveAccessibleName('Controls: Cursor');
  await card.getByRole('button', { name: 'Resume flight' }).click();
  await expect(page.getByTestId('flight-surface')).toHaveCount(1);
  await isCurrent(page, 'Cursor');
  expect(await controls(page)).toBeNull();
  expect((await saved(page)).controlLab).toBe('standard');
  expect(t.errors).toEqual([]); await t.context.close();
});

test('a switch mid-cruise or mid-blast leaves no stuck movement or fire', async ({ browser }) => {
  const t = await labPage(browser, 'conduct'), { page } = t;
  const card = paused(page);
  await lift(page);
  // Conduct cruise (a click on empty sky near the centre), then Escape (nothing is being drawn, so it pauses) and Draw by keyboard.
  await page.mouse.click(720, 300);
  await expect.poll(async () => (await tel(page)).speed).toBeGreaterThan(1.5);
  await page.keyboard.press('Escape'); await expect(card).toBeVisible();
  await card.getByTestId('controls-row').click(); await expect(radio(sheet(page), /^Conduct/)).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(radio(sheet(page), /^Draw/)).toBeChecked();
  await page.keyboard.press('Escape'); await expect(sheet(page)).toHaveCount(0); await expect(card).toBeVisible();
  await card.getByRole('button', { name: 'Resume flight' }).click();
  await isCurrent(page, 'Draw');
  await expect.poll(async () => (await tel(page)).speed, { timeout: 5000 }).toBeLessThan(.3);

  // In Draw, press and hold on a drone: sustained aimed fire. Escape pauses mid-blast, Brush is picked, the button comes up off
  // the surface, and Resume leaves the trigger released.
  const d = await droneIn(page, { x0: 200, y0: 150, x1: 1240, y1: 800 });
  test.skip(!d, 'no drone in view from the lift point');
  const before = await shots(page);
  await page.mouse.move(d!.x, d!.y); await page.mouse.down(); await page.waitForTimeout(500);
  await expect.poll(() => shots(page)).toBeGreaterThan(before);
  await page.keyboard.press('Escape'); await expect(card).toBeVisible();
  await card.getByTestId('controls-row').click(); await expect(radio(sheet(page), /^Draw/)).toBeFocused();
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown');
  await expect(radio(sheet(page), /^Brush/)).toBeChecked();
  await page.keyboard.press('Escape'); await expect(sheet(page)).toHaveCount(0); await expect(card).toBeVisible();
  await page.mouse.up(); // the button comes up while paused, on the pause card
  await card.getByRole('button', { name: 'Resume flight' }).click();
  await isCurrent(page, 'Brush');
  await page.waitForTimeout(500); const settled = await shots(page);
  await page.waitForTimeout(1200); expect(await shots(page)).toBe(settled);
  // Brush mounted in the air does not cruise until the first stroke.
  expect((await tel(page)).speed).toBeLessThan(.3); expect((await tel(page)).flying).toBe(true);
  expect(t.errors).toEqual([]); await t.context.close();
});

test('a sheet switch mid-cruise stops the cruise; keys 1-8 switch while playing and while paused (paused stays paused)', async ({ browser }) => {
  const t = await labPage(browser, 'conduct'), { page } = t;
  await lift(page);
  await page.mouse.click(720, 300);
  await expect.poll(async () => (await tel(page)).speed).toBeGreaterThan(1.5);
  await openSheet(page); await row(page, 'draw').click();
  await isCurrent(page, 'Draw');
  await expect.poll(async () => (await tel(page)).speed, { timeout: 5000 }).toBeLessThan(.3);
  // Escape closes the sheet (no pause); Digit8 is Brush on the desktop list.
  await page.keyboard.press('Escape'); await expect(sheet(page)).toHaveCount(0); await expect(paused(page)).toHaveCount(0);
  await page.keyboard.press('Digit8'); await isCurrent(page, 'Brush'); expect(await controls(page)).toBe('brush');
  await page.keyboard.press('Escape');
  const card = paused(page);
  await expect(card).toBeVisible();
  // Paused, the top row is empty (no trigger): the page's current control id says which one the key chose.
  await page.keyboard.press('Digit1'); await expect.poll(() => controlId(page)).toBe('cursor');
  await expect(card).toBeVisible();
  expect(await controls(page)).toBeNull();
  expect(t.errors).toEqual([]); await t.context.close();
});

// Review 2026-09-25: in portrait the top toast (the switch note, blaster on) overlapped the MERIDIAN / altitude block, and each lab
// tip showed twice (the bottom ghost with Skip tip, and again as the top toast). Emulated phones; layout only, not an iPhone.
for (const viewport of [{ width: 393, height: 852 }, { width: 375, height: 667 }, { width: 852, height: 393 }]) {
  test(`${viewport.width}x${viewport.height}: the switch toast clears the telemetry, and a lab tip shows once`, async ({ browser }) => {
    const t = await labPage(browser, 'standard', { touch: true, viewport }), { page } = t;
    await trigger(page).tap(); await expect(sheet(page)).toBeVisible();
    await row(page, 'draw').tap();
    const hint = page.locator('[class*="flightHint"]'), telemetry = page.getByTestId('flight-telemetry');
    await expect(hint).toHaveText('Draw controls');
    const a = (await hint.boundingBox())!, b = (await telemetry.boundingBox())!;
    const overlap = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
    expect(overlap, `toast ${JSON.stringify(a)} vs telemetry ${JSON.stringify(b)}`).toBe(0);
    // The first tip appears at the bottom with Skip tip and is announced, but never as the top toast.
    const ghost = page.getByTestId('lab-ghost');
    await expect(ghost).toBeVisible({ timeout: 8000 });
    const tip = (await ghost.locator('span').first().textContent())!.trim();
    await expect(page.getByTestId('lab-tip-live')).toHaveText(tip);
    await page.waitForTimeout(300);
    expect(await hint.count() ? await hint.textContent() : '').not.toBe(tip);
    expect(t.errors).toEqual([]); await t.context.close();
  });
}
