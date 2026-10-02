import { expect, test } from '@playwright/test';
import { box, inside, openSheet, sheet } from './controls-browser';
import { card, chip, DESK, lift, lockedName, mock, notYet, paused, playing, PORTRAIT, TWO_DESK, TWO_TOUCH, VOTE_NAME, votePage } from './vote-browser';
// Third-review low findings in a real browser (V4, V5, V7, CODE-4). System Chrome emulation, /api/vote and /api/results always mocked.
// PLAYTEST_URL=http://127.0.0.1:3441. Emulation is not iPhone validation.

test('@vote V5 focus goes back when the card closes: to the pause card door it was opened from, and to the flight surface (the keyboard target of the game, as the Controls sheet does) after a chip open on a running game', async ({ browser }) => {
  const t = await votePage(browser, TWO_DESK), { page } = t;
  await mock(page, [200]);
  await lift(page);
  await page.keyboard.press('Escape');
  await expect(paused(page)).toBeVisible();
  await paused(page).getByTestId('vote-open').click();
  await expect(card(page)).toBeVisible();
  await notYet(page).click();
  await expect(card(page)).toHaveCount(0);
  await expect(paused(page).getByTestId('vote-open')).toBeFocused(); // before: <main>
  await paused(page).getByRole('button', { name: /^Resume flight/ }).click();
  await expect(playing(page)).toBeVisible();
  await chip(page).focus();
  await page.keyboard.press('Enter');
  await expect(card(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(card(page)).toHaveCount(0);
  await expect(playing(page)).toBeVisible(); // the game resumed
  await expect(page.locator('#expedition')).toBeFocused();
  expect(await page.evaluate(() => document.activeElement === document.body)).toBe(false); // never left on nothing
  expect(t.errors).toEqual([]); await t.context.close();
});

test('@vote V7 after this family voted the Controls sheet has no lime Vote button: it says the vote is sent and is an outline', async ({ browser }) => {
  const mark = JSON.stringify({ round: 'r3', desktop: { at: Date.now() } });
  const t = await votePage(browser, TWO_DESK, { extra: { 'halaverga.vote.v1': mark } }), { page } = t;
  await mock(page, [200]);
  await expect(chip(page)).toHaveCount(0); // the chip goes once the family has voted
  await openSheet(page);
  const vote = sheet(page).getByTestId('controls-vote');
  await expect(vote).toHaveText('Vote sent: see results');
  expect(await vote.evaluate(e => getComputedStyle(e).backgroundColor)).not.toBe('rgb(212, 241, 151)');
  await expect(page.getByTestId('controls-tried')).toHaveText('Tried 2 of 8');
  await vote.click();
  await expect(card(page)).toBeVisible(); await expect(card(page)).toHaveAttribute('data-phase', 'done'); // it still opens the thanks
  expect(t.errors).toEqual([]); await t.context.close();
});

test('@vote V4 the pause card vote door is on screen without scrolling on a phone in portrait and on a 900 px desktop, with the ask above it, and the pill steps aside', async ({ browser }) => {
  const p = await votePage(browser, TWO_TOUCH, { touch: true }), phone = p.page;
  await mock(phone, [200]);
  await expect(chip(phone)).toBeVisible();
  const ask = paused(phone).getByText('Which way of flying felt best?', { exact: true }), door = paused(phone).getByTestId('vote-open');
  // The ask is set on the pause itself, by the lazy vote layer: a Pause tapped before that chunk has mounted gets the plain door, so retry.
  await expect(async () => {
    if (await paused(phone).isVisible()) await phone.getByRole('button', { name: 'Resume flight' }).tap();
    await phone.getByRole('button', { name: 'Pause expedition' }).tap();
    await expect(paused(phone)).toBeVisible(); await expect(ask).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 25000 });
  await expect(chip(phone)).toHaveCount(0); // the pause card owns the vote door now (the whole top row is empty while paused)
  await expect(door).toBeVisible();
  expect(inside(await box(door), PORTRAIT), 'phone door in the viewport').toBe(true); // before: below the fold (the whole Controls list sat above it)
  expect((await box(ask)).y).toBeLessThan((await box(door)).y);
  const d = await votePage(browser, TWO_DESK), page = d.page;
  await mock(page, [200]);
  await lift(page); await page.keyboard.press('Escape');
  await expect(paused(page)).toBeVisible();
  await expect(chip(page)).toHaveCount(0);
  expect(inside(await box(paused(page).getByTestId('vote-open')), DESK), 'desktop door in the viewport').toBe(true);
  await page.keyboard.press('Escape'); // never scrolled the card
  expect(p.errors.concat(d.errors)).toEqual([]); await p.context.close(); await d.context.close();
});

test('@vote CODE-4 the Controls and Vote names hold their visible words on a phone too: the dots are decoration with a text twin, and the pill says Vote', async ({ browser }) => {
  const t = await votePage(browser, {}, { touch: true }), { page } = t, trigger = page.getByTestId('controls-trigger');
  await expect(trigger).toBeVisible();
  expect((await trigger.innerText()).trim()).toBe('Controls'); // what is on screen: the word (the dots are aria-hidden shapes)
  await expect(trigger).toHaveAccessibleName(lockedName('One finger')); // the name starts with that word and ends with the dots' twin
  await t.context.close();
  const r = await votePage(browser, TWO_TOUCH, { touch: true });
  await expect(chip(r.page)).toBeVisible();
  expect((await chip(r.page).innerText()).trim()).toBe('Vote');
  await expect(chip(r.page)).toHaveAccessibleName(VOTE_NAME); // before: the visible seconds were the name; now the visible word is
  await expect(r.page.getByTestId('controls-trigger')).toHaveAccessibleName('Controls: One finger'); // no twin once the dots are gone
  expect(t.errors.concat(r.errors)).toEqual([]); await r.context.close();
});
