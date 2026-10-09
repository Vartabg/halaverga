import { expect, test, type Page } from '@playwright/test';
import { chip, paused, playing, TWO_DESK, ONE_DESK, trigger, votePage } from './vote-browser';

// The keyboard pass for the one-row top bar and the pause card (screen cleanup, unit 6). Real Tab presses, not focus() calls: the order
// the DOM gives is the order a keyboard player gets, and every stop shows the ring. System Chrome emulation, not a screen reader.
const who = (page: Page) => page.evaluate(() => {
  const e = document.activeElement as HTMLElement | null;
  return e ? (e.getAttribute('data-testid') ?? e.getAttribute('aria-label') ?? (e.textContent ?? '').trim().replace(/\s*↗$/, '')) : null;
});
const ring = (page: Page) => page.evaluate(() => {
  const s = getComputedStyle(document.activeElement as Element);
  return { style: s.outlineStyle, width: parseFloat(s.outlineWidth) };
});
async function tabTo(page: Page, name: string | RegExp, key = 'Tab') {
  await page.keyboard.press(key);
  const got = await who(page);
  if (typeof name === 'string') expect(got).toBe(name); else expect(got ?? '').toMatch(name);
  const r = await ring(page);
  expect(r.style, `${got} shows a focus ring`).not.toBe('none'); expect(r.width).toBeGreaterThanOrEqual(2);
}

test('keyboard: Tab runs through the top row as Vote, Controls, Pause and Shift+Tab runs back; every stop shows its ring', async ({ browser }) => {
  const t = await votePage(browser, TWO_DESK), { page } = t;
  await expect(chip(page)).toBeVisible();
  await chip(page).focus();
  expect(await who(page)).toBe('vote-chip');
  await tabTo(page, 'controls-trigger');
  await tabTo(page, 'Pause expedition');
  await tabTo(page, 'controls-trigger', 'Shift+Tab');
  await tabTo(page, 'vote-chip', 'Shift+Tab');
  expect(t.errors).toEqual([]); await t.context.close();
});

test('keyboard: while the vote is locked the row is Controls then Pause, and Enter on Controls opens the sheet on the checked radio', async ({ browser }) => {
  const t = await votePage(browser, ONE_DESK), { page } = t;
  await expect(chip(page)).toHaveCount(0);
  await trigger(page).focus();
  await tabTo(page, 'Pause expedition');
  await tabTo(page, 'controls-trigger', 'Shift+Tab');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('controls-sheet')).toBeVisible();
  await expect(page.getByTestId('controls-sheet').getByRole('radio', { checked: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('controls-sheet')).toHaveCount(0);
  await expect(playing(page), 'Escape closed only the sheet: still playing').toBeVisible();
  expect(t.errors).toEqual([]); await t.context.close();
});

test('keyboard: the pause card opens on Resume and Tab runs Vote, Controls, Field guide, Flight settings; Enter on the Controls row comes back to that row', async ({ browser }) => {
  const t = await votePage(browser, TWO_DESK), { page } = t;
  await expect(chip(page)).toBeVisible();
  await playing(page).click();
  await expect(paused(page)).toBeVisible();
  await expect(paused(page).getByRole('button', { name: 'Resume flight' })).toBeFocused();
  await expect(paused(page).getByTestId('controls-row')).toBeVisible(); // the Controls rows are a lazy chunk: Tab only after they are in the card
  await tabTo(page, 'vote-open');
  await tabTo(page, 'controls-row');
  await tabTo(page, 'Field guide');
  await tabTo(page, 'Flight settings');
  await tabTo(page, 'Field guide', 'Shift+Tab');
  await tabTo(page, 'controls-row', 'Shift+Tab');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('controls-sheet')).toBeVisible();
  await expect(paused(page), 'the card steps aside while the sheet shows').toBeHidden();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('controls-sheet')).toHaveCount(0);
  await expect(paused(page).getByTestId('controls-row'), 'focus returns to the row that opened the sheet').toBeFocused();
  expect(t.errors).toEqual([]); await t.context.close();
});
