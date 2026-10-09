import { expect, test } from '@playwright/test';
import { controlId, openSheet, sheet } from './controls-browser';
import { card, chip, land, lift, mock, notYet, ONE_DESK, paused, playing, PLAY_KEY, QUESTION, tel, TWO_DESK, VOTE_NAME, voteMark, votePage } from './vote-browser';
// The doors to the card besides the chip (spec 1.3): the auto-open after a landing, the pause card, the Controls sheet; plus the card as
// a modal and the play-time tracker. System Chrome emulation, /api/vote and /api/results always mocked. PLAYTEST_URL=http://127.0.0.1:3421.
const ASK = QUESTION;
/** Total play seconds in the saved record (the layer saves on pagehide; fire it to flush, which pauses the game: read it once, at the end). */
async function playedSecs(page: import('@playwright/test').Page) {
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  return page.evaluate(key => Object.values((JSON.parse(localStorage.getItem(key) ?? '{"secs":{}}') as { secs: Record<string, number> }).secs).reduce((a, b) => a + b, 0), PLAY_KEY);
}

test('@vote two tried: a landing auto-opens the card and pauses, an early tap does nothing (400 ms guard), and Not yet records the 24 h quiet', async ({ browser }) => {
  const t = await votePage(browser, TWO_DESK), { page } = t;
  await mock(page, [200]);
  await lift(page);
  await land(page);
  // A finger already down when the card opens keeps the guard on (up to 4 s), so the early tap does not depend on how fast this script reacts.
  await page.mouse.move(720, 450); await page.mouse.down();
  await card(page).waitFor({ state: 'visible', timeout: 30000 });
  const probe = await page.evaluate(() => {
    const c = document.querySelector('[data-testid=vote-card]')!, no = [...c.querySelectorAll('button')].find(b => b.textContent === 'Not yet')!;
    const r = no.getBoundingClientRect(), x = r.x + r.width / 2, y = r.y + r.height / 2;
    return { guard: c.hasAttribute('data-guard'), hit: document.elementFromPoint(x, y) === no, x, y };
  });
  expect(probe.guard).toBe(true); expect(probe.hit).toBe(false);
  await expect(card(page).getByTestId('vote-family')).toHaveText('Desktop controls');
  await page.mouse.move(probe.x, probe.y); await page.mouse.up();
  await expect(card(page)).toBeVisible();
  await expect(playing(page)).toHaveCount(0); // the auto-open paused the game
  await expect(card(page)).not.toHaveAttribute('data-guard', /.*/);
  await notYet(page).click();
  await expect(card(page)).toHaveCount(0);
  await expect(playing(page)).toBeVisible();
  expect(typeof (await voteMark(page)).desktop.skippedAt).toBe('number'); // only an auto-open's Skip records the quiet
  // Once per page load (and quiet for 24 h): another landing does not reopen it.
  await lift(page); await land(page);
  await expect.poll(async () => (await tel(page)).flying, { timeout: 30000 }).toBe(false);
  await page.waitForTimeout(500);
  await expect(card(page)).toHaveCount(0);
  expect(t.errors).toEqual([]); await t.context.close();
});

test('@vote one tried control is not enough for the auto-open: a landing leaves the game running', async ({ browser }) => {
  const t = await votePage(browser, ONE_DESK), { page } = t;
  await mock(page, [200]);
  await lift(page); await land(page);
  await expect.poll(async () => (await tel(page)).flying, { timeout: 30000 }).toBe(false);
  await page.waitForTimeout(800);
  await expect(card(page)).toHaveCount(0); await expect(playing(page)).toBeVisible();
  expect(t.errors).toEqual([]); await t.context.close();
});

test('@vote the pause card: with two tried it leads with the question above Vote, with one it has no door at all; opening it yourself never auto-opens the card', async ({ browser }) => {
  const t = await votePage(browser, TWO_DESK), { page } = t;
  await mock(page, [200]);
  await expect(chip(page)).toBeVisible(); // the vote works: the pause card's door follows the same answer as the pill
  await lift(page);
  await page.keyboard.press('Escape');
  await expect(paused(page)).toBeVisible();
  await page.waitForTimeout(1200);
  await expect(card(page)).toHaveCount(0);
  await expect(paused(page).getByText(ASK, { exact: true })).toBeVisible();
  const open = paused(page).getByTestId('vote-open');
  await expect(open).toHaveText('Vote'); await expect(open).toHaveAccessibleName(VOTE_NAME); await expect(open).toHaveAttribute('data-nudge', '');
  const ask = await paused(page).getByText(ASK, { exact: true }).boundingBox(), b = await open.boundingBox();
  expect(ask!.y).toBeLessThan(b!.y); // the line sits above the button
  await open.click();
  await expect(card(page)).toBeVisible();
  expect(t.errors).toEqual([]); await t.context.close();
  const u = await votePage(browser, ONE_DESK);
  await lift(u.page); await u.page.keyboard.press('Escape');
  await expect(paused(u.page)).toBeVisible();
  await expect(paused(u.page).getByTestId('controls-row')).toBeVisible();
  await expect(paused(u.page).getByTestId('vote-open')).toHaveCount(0); // one way of two: a plain line, never a button
  await expect(paused(u.page).getByText(ASK, { exact: true })).toHaveCount(0);
  await expect(paused(u.page).getByTestId('controls-tried')).toHaveText('Tried 1 of 2 needed to vote');
  expect(u.errors).toEqual([]); await u.context.close();
});

test('@vote the Controls sheet: Vote is the accent primary and Done the outline once two ways are flown (with one there is only the line); the button opens the card', async ({ browser }) => {
  const u = await votePage(browser, ONE_DESK);
  await openSheet(u.page);
  await expect(u.page.getByTestId('controls-tried')).toHaveText('Tried 1 of 2 needed to vote');
  await expect(sheet(u.page).getByTestId('controls-vote')).toHaveCount(0);
  await expect(sheet(u.page).getByTestId('controls-done')).toBeVisible();
  const t = await votePage(browser, TWO_DESK), { page } = t;
  await mock(page, [200]);
  await expect(chip(page)).toBeVisible();
  await openSheet(page);
  await expect(page.getByTestId('controls-tried')).toHaveText('Tried 2 of 8');
  const vote = sheet(page).getByTestId('controls-vote'), done = sheet(page).getByTestId('controls-done');
  await expect(vote).toHaveText('Vote'); await expect(vote).toHaveAccessibleName(VOTE_NAME);
  const bg = (l: typeof vote) => l.evaluate(e => getComputedStyle(e).backgroundColor);
  expect(await bg(vote)).toBe('rgb(94, 230, 208)'); expect(await bg(done)).toBe('rgba(0, 0, 0, 0)');
  expect((await vote.boundingBox())!.x).toBeLessThan((await done.boundingBox())!.x); // the vote comes first
  await vote.click();
  await expect(card(page)).toBeVisible(); await expect(sheet(page)).toHaveCount(0);
  await expect(playing(page)).toHaveCount(0); // the game is held behind the card
  await notYet(page).click();
  await expect(playing(page)).toBeVisible();
  expect(t.errors.concat(u.errors)).toEqual([]); await t.context.close(); await u.context.close();
});

test('@vote the card is a modal dialog: the keyboard cannot leave it or switch controls behind it, and Not yet restores the page', async ({ browser }) => {
  const t = await votePage(browser, TWO_DESK), { page } = t;
  await mock(page, [200]);
  await chip(page).click();
  await expect(card(page)).toBeVisible();
  const before = await controlId(page);
  await expect(page.getByRole('dialog', { name: ASK })).toBeVisible();
  await expect(page.locator('header')).toHaveAttribute('inert', '');
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Shift+Tab');
    expect(await page.evaluate(() => !!document.activeElement?.closest('[data-testid=vote-card]') || document.activeElement === document.body)).toBe(true);
  }
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('Digit3'); // the digit shortcuts do not reach past the card either
  expect(await controlId(page)).toBe(before);
  await notYet(page).click();
  await expect(card(page)).toHaveCount(0);
  await expect(page.locator('header')).not.toHaveAttribute('inert', '');
  expect(t.errors).toEqual([]); await t.context.close();
});

// The tracker: only seconds with input count, so merely opening the sheet or the chip accrues nothing, and a held key does.
test('@vote an idle session that only opens the sheet and steps through the controls accrues no tried time', async ({ browser }) => {
  const t = await votePage(browser, {}), { page } = t;
  await mock(page, [200]);
  await openSheet(page);
  await page.waitForTimeout(2600); // the Begin click is outside the 2 s input window by now; the trigger click is the header's, not game input
  // Three steps: the checked radio, the number-keys box, Done (a locked vote has no Vote button in the footer); a fourth leaves the sheet for Lift.
  for (let i = 0; i < 3; i++) { await page.keyboard.press('Tab'); await page.waitForTimeout(150); }
  await sheet(page).hover();
  await page.waitForTimeout(3600);
  // The backdrop is a header sibling now, not a dialog: moving the mouse across it for 3 s is not game input either.
  const spot = await page.evaluate(() => {
    const b = document.querySelector('[data-testid=controls-backdrop]');
    for (let x = 20; x < innerWidth; x += 20) if (document.elementFromPoint(x, 450) === b) return { x, y: 450 };
    return null;
  });
  expect(spot, 'a point on the backdrop outside the sheet').not.toBeNull();
  for (let i = 0; i < 12; i++) { await page.mouse.move(spot!.x + (i % 2) * 8, spot!.y); await page.waitForTimeout(250); }
  await page.keyboard.press('Escape');
  await expect(sheet(page)).toHaveCount(0);
  await page.waitForTimeout(2600);
  expect(await playedSecs(page)).toBeLessThanOrEqual(2); // Begin's own press may count up to 2
  expect(t.errors).toEqual([]); await t.context.close();
});

test('@vote a key held in the scene is input: the current control accrues tried seconds', async ({ browser }) => {
  const t = await votePage(browser, {}), { page } = t;
  await mock(page, [200]);
  await page.waitForTimeout(2600);
  await page.keyboard.down('ArrowRight'); await page.waitForTimeout(3600); await page.keyboard.up('ArrowRight');
  expect(await playedSecs(page)).toBeGreaterThanOrEqual(3);
  expect(t.errors).toEqual([]); await t.context.close();
});
