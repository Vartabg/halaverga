import { expect, test } from '@playwright/test';
import { openSheet, sheet } from './controls-browser';
import { card, chip, mock, notYet, openFromChip, paused, pickAndSend, playing, radio, sendBtn, TWO_DESK, voteMark, votePage, voteResults } from './vote-browser';
// What Send does with each answer (spec 1.7, 1.8, 1.5): one nonce, a kept pick, honest copy, focus and Escape after a failure. System
// Chrome emulation; /api/vote and /api/results are always mocked. PLAYTEST_URL=http://127.0.0.1:3421 pnpm test:browser -g "@vote".
const BUSY = 'Voting is busy right now. Try again later.', FAILED = "Couldn't send. Tap Send to try again.";
const nonceOf = (b: Record<string, unknown>) => b.nonce as string;

test('@vote a first aborted request is retried once, with the same nonce, and then counts', async ({ browser }) => {
  const t = await votePage(browser, TWO_DESK), { page } = t, bodies = await mock(page, ['abort', 200]);
  await openFromChip(page);
  await pickAndSend(page);
  await expect(card(page).getByRole('status')).toHaveText('Thanks. Your vote is in.', { timeout: 10000 });
  expect(bodies).toHaveLength(2);
  expect(nonceOf(bodies[1])).toBe(nonceOf(bodies[0])); // the retry is the same Send: a lost reply can never count twice
  expect(t.errors).toEqual([]); await t.context.close();
});

test('@vote a 502 is not retried, keeps the pick, and Send offers Try again with the same nonce', async ({ browser }) => {
  const t = await votePage(browser, TWO_DESK), { page } = t, bodies = await mock(page, [502, 200]);
  await openFromChip(page);
  await pickAndSend(page);
  await expect(card(page).getByRole('status')).toHaveText(FAILED);
  await page.waitForTimeout(1500); // longer than the 1 s pause a retry would take
  expect(bodies).toHaveLength(1);
  await expect(radio(page, 'Cursor')).toBeChecked();
  await expect(sendBtn(page)).toHaveText('Try again');
  await sendBtn(page).click();
  await expect(card(page).getByRole('status')).toHaveText('Thanks. Your vote is in.');
  expect(bodies).toHaveLength(2); expect(nonceOf(bodies[1])).toBe(nonceOf(bodies[0]));
  expect(t.errors).toEqual([]); await t.context.close();
});

test('@vote a failed send survives a reload: the saved vote is offered with its pick, and sending it reuses the nonce', async ({ browser }) => {
  const t = await votePage(browser, TWO_DESK), { page } = t, bodies = await mock(page, [502, 200]);
  await openFromChip(page);
  await pickAndSend(page, 'Draw');
  await expect(card(page).getByRole('status')).toHaveText(FAILED);
  await page.reload();
  const begin = page.getByRole('button', { name: 'Begin expedition' });
  await expect(begin).toBeEnabled({ timeout: 60000 });
  await begin.click();
  await openFromChip(page);
  await expect(radio(page, 'Draw')).toBeChecked();
  await expect(card(page).getByRole('status')).toHaveText("Your last vote didn't send. Tap Send to try again.");
  await sendBtn(page).click();
  await expect(card(page).getByRole('status')).toHaveText('Thanks. Your vote is in.');
  expect(bodies).toHaveLength(2);
  expect(nonceOf(bodies[1])).toBe(nonceOf(bodies[0])); expect(bodies[1].favorite).toBe('draw');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('halaverga.vote.pending') ?? '{}').desktop)).toBeUndefined(); // cleared by the 200
  expect(t.errors).toEqual([]); await t.context.close();
});

test('@vote a 429 shows the busy copy, keeps the pick, never says the vote is in, and is not retried', async ({ browser }) => {
  const t = await votePage(browser, TWO_DESK), { page } = t, bodies = await mock(page, [429]);
  await openFromChip(page);
  await pickAndSend(page);
  await expect(card(page).getByRole('status')).toHaveText(BUSY);
  await expect(sendBtn(page)).toHaveText('Try again'); await expect(sendBtn(page)).toBeFocused();
  await expect(radio(page, 'Cursor')).toBeChecked();
  await expect(card(page).getByText(/your vote is in|thanks/i)).toHaveCount(0);
  await expect(card(page)).toHaveAttribute('data-phase', 'ballot');
  await page.waitForTimeout(1500);
  expect(bodies).toHaveLength(1);
  expect((await voteMark(page))?.desktop?.at).toBeUndefined(); // the device is not marked as voted
  expect(await page.evaluate(() => localStorage.getItem('halaverga.vote.pending'))).toContain('"desktop"'); // the pick is kept
  // The vote card has the game paused, and the top row is empty while paused: the pill is back once the card is closed unsent.
  await notYet(page).click();
  await expect(chip(page)).toBeVisible();
  expect(t.errors).toEqual([]); await t.context.close();
});

for (const [status, text] of [[400, "This page can't send that vote. Reload the page and try again."], [403, 'Open the game at its own web address, then vote.']] as const) {
  test(`@vote a ${status} says what to do and is not retried`, async ({ browser }) => {
    const t = await votePage(browser, TWO_DESK), { page } = t, bodies = await mock(page, [status]);
    await openFromChip(page);
    await pickAndSend(page);
    await expect(card(page).getByRole('status')).toHaveText(text);
    expect(bodies).toHaveLength(1);
    expect((await voteMark(page))?.desktop?.at).toBeUndefined();
    expect(t.errors).toEqual([]); await t.context.close();
  });
}

test("@vote a 503 on Send replaces the ballot with Voting isn't open right now, and Keep playing resumes", async ({ browser }) => {
  const t = await votePage(browser, TWO_DESK), { page } = t;
  await mock(page, [503]);
  await openFromChip(page);
  await pickAndSend(page);
  await expect(card(page)).toHaveAttribute('data-phase', 'closed');
  await expect(card(page).getByTestId('vote-closed')).toHaveText("Voting isn't open right now.");
  await expect(card(page).getByRole('radio')).toHaveCount(0);
  await expect(card(page).getByRole('button', { name: 'Keep playing' })).toBeFocused();
  await card(page).getByRole('button', { name: 'Keep playing' }).click();
  await expect(card(page)).toHaveCount(0); await expect(playing(page)).toBeVisible();
  expect((await voteMark(page))?.desktop?.at).toBeUndefined();
  expect(t.errors).toEqual([]); await t.context.close();
});

for (const [name, results] of [['open:false', voteResults({}, false)], ['a failing /api/results', 503 as number], ['a 500 from /api/results', 500 as number]] as const) {
  test(`@vote the soft paused line shows when the probe says ${name}; the ballot stays and Send is still attempted`, async ({ browser }) => {
    const t = await votePage(browser, TWO_DESK), { page } = t;
    await expect(chip(page)).toBeVisible(); // the pill's own ballot check has been answered (open), so only the CARD's read meets the mock below
    const bodies = await mock(page, [200], results);
    await openFromChip(page);
    await expect(card(page).getByTestId('vote-paused')).toHaveText('Voting may be paused. You can still try to send.');
    await expect(card(page)).toHaveAttribute('data-phase', 'ballot');
    await pickAndSend(page);
    await expect(card(page).getByRole('status')).toHaveText('Thanks. Your vote is in.');
    expect(bodies).toHaveLength(1);
    expect(t.errors).toEqual([]); await t.context.close();
  });
}

test('@vote an open, ranked probe shows no paused line', async ({ browser }) => {
  const t = await votePage(browser, TWO_DESK), { page } = t;
  await mock(page, [200], voteResults({ desktop: { votes: 40, ranked: true, tie: 1, order: ['cursor', 'draw'], controls: {} } }));
  await openFromChip(page);
  await expect(radio(page, 'Cursor')).toBeVisible();
  await expect(card(page).getByTestId('vote-paused')).toHaveCount(0);
  expect(t.errors).toEqual([]); await t.context.close();
});

test('@vote after a failed send focus is on Send, Escape still closes the card, and the game resumes', async ({ browser }) => {
  const t = await votePage(browser, TWO_DESK), { page } = t;
  await mock(page, [502]);
  await openFromChip(page);
  await pickAndSend(page);
  await expect(card(page).getByRole('status')).toHaveText(FAILED);
  await expect(sendBtn(page)).toBeFocused();
  await page.mouse.click(5, 5); // focus leaves the card; Escape is a window listener while the card is mounted
  await page.keyboard.press('Escape');
  await expect(card(page)).toHaveCount(0);
  await expect(playing(page)).toBeVisible(); await expect(paused(page)).toHaveCount(0);
  expect(t.errors).toEqual([]); await t.context.close();
});

test('@vote a manual Not yet or Escape leaves no Skip mark and the pill stays', async ({ browser }) => {
  const t = await votePage(browser, TWO_DESK), { page } = t;
  await mock(page, [200]);
  await openFromChip(page);
  await notYet(page).click();
  await expect(card(page)).toHaveCount(0);
  expect(await voteMark(page)).toBeNull();
  await openFromChip(page);
  await page.keyboard.press('Escape');
  await expect(card(page)).toHaveCount(0);
  expect(await voteMark(page)).toBeNull();
  await expect(chip(page)).toBeVisible();
  expect(t.errors).toEqual([]); await t.context.close();
});

test('@vote a device that already voted sees the thanks and no second ballot when the card is opened from the Controls sheet, and the pause card has no door', async ({ browser }) => {
  const t = await votePage(browser, TWO_DESK, { extra: { 'halaverga.vote.v1': JSON.stringify({ round: 'r3', desktop: { at: Date.now() - 1000 } }) } }), { page } = t;
  await mock(page, [200]);
  await expect(chip(page)).toHaveCount(0); // no pill after a vote
  await openSheet(page);
  await expect(sheet(page).getByTestId('controls-vote')).toHaveText('Vote sent: see results');
  await sheet(page).getByTestId('controls-vote').click();
  await expect(card(page)).toHaveAttribute('data-phase', 'done');
  await expect(card(page).getByRole('status')).toHaveText('Your vote is in. Thanks.');
  await expect(card(page).getByRole('radio')).toHaveCount(0);
  await card(page).getByRole('button', { name: 'Done' }).click();
  await expect(card(page)).toHaveCount(0);
  await expect(playing(page)).toBeVisible(); // the card was opened over a running game, so Done gives it back
  await playing(page).click();
  await expect(paused(page)).toBeVisible();
  await expect(paused(page).getByTestId('vote-open')).toHaveCount(0); // sent: nothing on the pause card
  expect(t.errors).toEqual([]); await t.context.close();
});
