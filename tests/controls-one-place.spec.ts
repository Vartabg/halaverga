import { expect, test } from '@playwright/test';
import { labPage, openGuide, openSettings, pauseCard, resumeFromCard } from './lab-browser';
import { DESKTOP, openSheet, saved, sheet } from './controls-browser';
// One Controls place (screen cleanup unit 3): Pause pressed with the sheet open, focus after each way back to the pause card, Flight
// settings' Resume, the sheet's link to Flight settings, and the pause card that is not ready yet. System Chrome emulation: it checks
// the wiring and the focus, never how a thumb feels on a real iPhone.
const pauseButton = (p: import('@playwright/test').Page) => p.getByRole('button', { name: 'Pause expedition' });
const resumeButton = (p: import('@playwright/test').Page) => pauseCard(p).getByRole('button', { name: 'Resume flight' });

test('desktop: one click on Pause with the sheet open pauses and closes it; the row, Escape and Resume go round again', async ({ browser }) => {
  const t = await labPage(browser, 'standard'), { page } = t;
  await openSheet(page);
  await pauseButton(page).click(); // the header sits above the backdrop: one press, not two
  await expect(sheet(page)).toHaveCount(0);
  await expect(pauseCard(page)).toBeVisible();
  await expect(resumeButton(page)).toBeFocused(); // a fresh card: Resume is where focus starts
  // The card's row opens the same sheet over the paused game; the card steps aside while it shows.
  await pauseCard(page).getByTestId('controls-row').click();
  await expect(sheet(page)).toBeVisible(); await expect(pauseCard(page)).toHaveCount(0);
  // Escape closes only the sheet: still paused (no Pause button, the card is back), and focus is on the row that opened it.
  await page.keyboard.press('Escape');
  await expect(sheet(page)).toHaveCount(0); await expect(pauseCard(page)).toBeVisible(); await expect(pauseButton(page)).toHaveCount(0);
  await expect(pauseCard(page).getByTestId('controls-row')).toBeFocused();
  await resumeFromCard(page);
  expect(t.errors).toEqual([]); await t.context.close();
});

test('every way back to the pause card leaves focus on a control of the card, and no way back resumes the game', async ({ browser }) => {
  const t = await labPage(browser, 'standard'), { page } = t, card = pauseCard(page);
  await pauseButton(page).click();
  await expect(resumeButton(page)).toBeFocused();
  // Flight settings: Close returns to the card (the game stays paused), with Resume focused again.
  await openSettings(page);
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await expect(card).toBeVisible(); await expect(pauseButton(page)).toHaveCount(0); await expect(resumeButton(page)).toBeFocused();
  // The Field guide, the same.
  await openGuide(page);
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await expect(card).toBeVisible(); await expect(pauseButton(page)).toHaveCount(0); await expect(resumeButton(page)).toBeFocused();
  // The sheet, from the card: Done returns to the card with focus on the Controls row (the sheet's own door).
  await card.getByTestId('controls-row').click();
  await sheet(page).getByTestId('controls-done').click();
  await expect(card).toBeVisible(); await expect(pauseButton(page)).toHaveCount(0); await expect(card.getByTestId('controls-row')).toBeFocused();
  // The sheet from Flight settings' row: the same way back, to the card.
  await openSettings(page);
  await page.getByRole('dialog', { name: 'Flight settings' }).getByTestId('controls-row').click();
  await expect(sheet(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(card).toBeVisible(); await expect(pauseButton(page)).toHaveCount(0); await expect(card.getByTestId('controls-row')).toBeFocused();
  expect(t.errors).toEqual([]); await t.context.close();
});

test('Flight settings has a lime Resume in its footer: Pause, settings, adjust, Resume is one trip; Close only returns to the card', async ({ browser }) => {
  const t = await labPage(browser, 'standard'), { page } = t, dialog = page.getByRole('dialog', { name: 'Flight settings' });
  await openSettings(page);
  const resume = dialog.getByRole('button', { name: 'Resume flight' });
  await expect(resume).toHaveText('Resume'); await expect(resume).toBeEnabled();
  expect(await resume.evaluate(e => getComputedStyle(e).backgroundColor), 'lime, the same as the card\'s Resume').toBe('rgb(212, 241, 151)');
  const was = (await saved(page)).reduced; await page.getByLabel('Reduced camera motion').setChecked(!was);
  await resume.click();
  await expect(dialog).toHaveCount(0); await expect(pauseCard(page)).toHaveCount(0); await expect(pauseButton(page)).toBeVisible();
  await page.reload(); // a reload saves on pagehide: the adjusted setting is kept
  expect((await saved(page)).reduced).toBe(!was);
  expect(t.errors).toEqual([]); await t.context.close();
});

test('Flight settings stays reachable with its Resume at the bottom edge while the settings scroll (375 x 667)', async ({ browser }) => {
  const t = await labPage(browser, 'standard', { touch: true, viewport: { width: 375, height: 667 } }), { page } = t;
  await openSettings(page, true);
  const resume = page.getByRole('dialog', { name: 'Flight settings' }).getByRole('button', { name: 'Resume flight' });
  const b = (await resume.boundingBox())!;
  expect(b.y + b.height, 'Resume is inside the screen without scrolling').toBeLessThanOrEqual(667 + .5);
  expect(b.height).toBeGreaterThanOrEqual(44);
  await resume.tap();
  await expect(pauseButton(page)).toBeVisible();
  expect(t.errors).toEqual([]); await t.context.close();
});

test('touch: the sheet footer links to Flight settings, and the pause card says what is in there', async ({ browser }) => {
  const t = await labPage(browser, 'standard', { touch: true, viewport: { width: 375, height: 667 } }), { page } = t;
  await openSheet(page, true);
  const link = sheet(page).getByTestId('controls-settings');
  await expect(link).toHaveText('Flight settings');
  await expect(link).toHaveAccessibleName('Flight settings: size, left-handed, look speed');
  expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await link.tap();
  // Pause, then the dialog: the sheet is gone, the game is paused, and Close returns to the pause card.
  await expect(sheet(page)).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: 'Flight settings' })).toBeVisible(); await expect(pauseButton(page)).toHaveCount(0);
  await page.getByRole('button', { name: 'Close dialog' }).tap();
  await expect(pauseCard(page)).toBeVisible();
  // The card's own line names what Flight settings holds, and the button is described by it.
  await expect(pauseCard(page).getByText('Size, left-handed, look speed', { exact: true })).toBeVisible();
  await expect(pauseCard(page).getByRole('button', { name: 'Flight settings', exact: true })).toHaveAccessibleDescription('Size, left-handed, look speed');
  expect(t.errors).toEqual([]); await t.context.close();
});

test('desktop: the sheet has no Flight settings link (the number-keys checkbox is its footer line)', async ({ browser }) => {
  const t = await labPage(browser, 'standard'), { page } = t;
  await openSheet(page);
  await expect(sheet(page).getByTestId('controls-settings')).toHaveCount(0);
  await expect(sheet(page).getByRole('checkbox', { name: 'Number keys 1-8 switch controls' })).toBeVisible();
  expect(t.errors).toEqual([]); await t.context.close();
});

test('a pause card that is not ready keeps focus on the card, then hands it to Resume once it is (the lab chunk held back)', async ({ browser }) => {
  const context = await browser.newContext({ viewport: DESKTOP }), page = await context.newPage(), errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  // Hold the Gesture Lab chunk ('lab-surface' is its surface's test id: in no first-load or other chunk): switching to Draw in play then
  // leaves the controls not ready, and the pause card shows `Restoring your suit…` with Resume disabled.
  let release = () => {}; const gate = new Promise<void>(r => { release = r; });
  await page.route('**/_next/static/chunks/*.js', async route => {
    const res = await route.fetch(), body = await res.text();
    if (body.includes('lab-surface')) await gate;
    return route.fulfill({ response: res, body });
  });
  try {
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Begin expedition' })).toBeEnabled({ timeout: 60000 });
    await page.getByRole('button', { name: 'Begin expedition' }).click();
    await openSheet(page);
    await sheet(page).locator('[data-control="draw"]').click();
    await page.keyboard.press('Escape'); // closes the sheet
    await pauseButton(page).click();
    const card = pauseCard(page), wait = card.getByRole('button', { name: /Restoring your suit/ });
    await expect(wait).toBeVisible(); await expect(wait).toBeDisabled();
    await expect(card).toBeFocused(); // a disabled button cannot hold focus, so the card does: never the page behind
    release();
    await expect(resumeButton(page)).toBeEnabled({ timeout: 15000 });
    await expect(resumeButton(page)).toBeFocused();
  } finally { release(); }
  expect(errors).toEqual([]); await context.close();
});
