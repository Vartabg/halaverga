import { expect, test, type Page } from '@playwright/test';
import { DESKTOP, controlsPage, mockResults, mockVote, openSheet, playInit, row, sheet, trigger } from './controls-browser';
// Fixes from the 2026-09-28 controls-picker review: touch scroll in the sheet and the vote card, the vote pausing the game it opens
// over, a vote that needs some play, and a failed lazy chunk leaving the page standing. System Chrome emulation (touch emulation for
// the phone rows), never an iPhone. /api/vote and /api/results are always mocked. Run against a production build on port 3391 only.
const LANDSCAPE = { width: 852, height: 393 }, SHORT = { width: 750, height: 340 };
const playing = (p: Page) => p.locator('button[aria-label="Pause expedition"]');
const card = (p: Page) => p.getByTestId('vote-card');
/** touchmove events the page saw at bubble phase (after usePlayGuard's capture handler), with whether they were cancelled. */
const watchMoves = (p: Page) => p.evaluate(() => {
  const w = window as unknown as { __moves: { at: string; cancelled: boolean }[] }; w.__moves = [];
  document.addEventListener('touchmove', e => w.__moves.push({ at: (e.target as Element).closest('[data-testid]')?.getAttribute('data-testid') ?? (e.target as Element).tagName, cancelled: e.defaultPrevented }));
});
const moves = (p: Page) => p.evaluate(() => (window as unknown as { __moves: { at: string; cancelled: boolean }[] }).__moves);

for (const viewport of [LANDSCAPE, SHORT]) {
  test(`${viewport.width}x${viewport.height} touch: a swipe scrolls the Controls sheet while playing, and every touch control is reachable`, async ({ browser }) => {
    const t = await controlsPage(browser, 'standard', { touch: true, viewport }), { page, finger } = t;
    await openSheet(page, true);
    await expect(playing(page)).toHaveCount(1);
    const box = (await sheet(page).boundingBox())!;
    expect(box.y + box.height, 'the sheet ends inside the viewport').toBeLessThanOrEqual(viewport.height + .5);
    const list = sheet(page).locator('[data-scroll-ok]'), scroller = await list.evaluate(e => ({ over: e.scrollHeight - e.clientHeight })); // the list is the one scroller between the title and the footer
    await watchMoves(page);
    test.info().annotations.push({ type: 'overflow', description: String(scroller.over) });
    if (scroller.over > 0) {
      // Swipe up from the middle of the list: the finger must move the sheet, and the guard must not cancel it.
      const lb = (await list.boundingBox())!;
      await finger.down({ x: lb.x + lb.width / 2, y: lb.y + lb.height * .6 });
      await finger.drag({ x: lb.x + lb.width / 2, y: lb.y + 20 }, 12);
      await finger.up();
      await expect.poll(() => list.evaluate(e => e.scrollTop)).toBeGreaterThan(0);
      expect((await moves(page)).every(m => !m.cancelled)).toBe(true);
    }
    // Whether it fit or scrolled, the last touch control ends up inside the visible sheet.
    await row(page, 'brush').scrollIntoViewIfNeeded();
    const b = (await row(page, 'brush').boundingBox())!;
    expect(b.y + b.height).toBeLessThanOrEqual(viewport.height + .5);
    await expect(playing(page)).toHaveCount(1);
    expect(t.errors).toEqual([]); await t.context.close();
  });
}

test('touch: a swipe outside the sheet is still cancelled while playing (the page never scrolls)', async ({ browser }) => {
  const t = await controlsPage(browser, 'standard', { touch: true, viewport: SHORT }), { page, finger } = t;
  await openSheet(page, true);
  await watchMoves(page);
  const box = (await sheet(page).boundingBox())!;
  const x = Math.max(8, box.x / 2);
  await finger.down({ x, y: 250 }); await finger.drag({ x, y: 120 }, 8); await finger.up();
  const seen = await moves(page);
  expect(seen.length).toBeGreaterThan(0);
  expect(seen.every(m => m.cancelled)).toBe(true);
  expect(await page.evaluate(() => document.scrollingElement?.scrollTop ?? 0)).toBe(0);
  await t.context.close();
});

// The vote is off (src/lib/voteSwitch.ts, Garo 2026-11-17): the vote-card tests that lived here (pause behind the card, touch scroll, the
// play-needed gate, Send) skip with vote.spec.ts; what stays true now is that opening the sheet pauses nothing and nothing about a vote shows.
test('with the vote off the sheet has no Vote button or "needed to vote" line, at none or two ways flown, and no vote is recorded', async ({ browser }) => {
  for (const [name, init] of [['none flown', undefined], ['two flown', playInit({ 'desktop:cursor': 25, 'desktop:draw': 25 })]] as const) {
    const t = await controlsPage(browser, 'standard', { viewport: DESKTOP, init, routes: p => mockResults(p) }), { page } = t;
    const bodies = await mockVote(page);
    await openSheet(page);
    await expect(page.getByTestId('controls-tried'), name).not.toContainText('vote');
    await expect(page.getByTestId('controls-vote'), name).toHaveCount(0);
    await expect(card(page), name).toHaveCount(0);
    await expect(playing(page), name).toHaveCount(1);
    expect(bodies, name).toHaveLength(0);
    expect(await page.evaluate(() => localStorage.getItem('halaverga.vote.v1'))).toBeNull();
    expect(t.errors).toEqual([]); await t.context.close();
  }
});

test('a failed picker, row or vote chunk leaves the page standing: Begin, the Field guide, play and the pause card with Resume still work', async ({ browser }) => {
  const context = await browser.newContext({ viewport: DESKTOP });
  const page = await context.newPage();
  // Abort every lazy chunk that carries the picker, the pause card's Controls row or the vote card ('controls-trigger' and 'controls-row'
  // are the picker's and the row's test ids, 'vote-card' the card's; the card's question also sits in the pause card, which is first-load code).
  await page.route('**/_next/static/chunks/*.js', async route => {
    const res = await route.fetch(), body = await res.text();
    if (/controls-trigger|controls-row|vote-card/.test(body)) return route.abort('failed');
    return route.fulfill({ response: res, body });
  });
  await page.goto('/');
  const begin = page.getByRole('button', { name: 'Ascend Mount Hermon' });
  await expect(begin).toBeEnabled({ timeout: 60000 });
  await page.getByRole('button', { name: 'Field guide' }).click(); // the landing keeps the header button
  await expect(page.getByRole('heading', { name: 'Field guide' })).toBeVisible();
  await expect(page.getByText('Every way of flying is under Controls (top row)', { exact: false })).toBeVisible(); // one sentence, not a list
  await page.keyboard.press('Escape');
  await expect(begin).toBeVisible();
  await begin.click();
  await expect(page.getByRole('button', { name: 'Pause expedition' })).toBeVisible();
  await expect(trigger(page)).toHaveCount(0);
  // The pause card stands without the row: Resume, the Field guide and Flight settings are all there, and Resume plays on.
  await page.getByRole('button', { name: 'Pause expedition' }).click();
  const paused = page.getByRole('region', { name: 'Ascent paused' });
  await expect(paused.getByRole('button', { name: 'Resume flight' })).toBeVisible();
  await expect(paused.getByRole('button', { name: 'Field guide', exact: true })).toBeVisible();
  await expect(paused.getByRole('button', { name: 'Flight settings', exact: true })).toBeVisible();
  await expect(paused.getByTestId('controls-row')).toHaveCount(0);
  await paused.getByRole('button', { name: 'Resume flight' }).click();
  await expect(page.getByRole('button', { name: 'Pause expedition' })).toBeVisible();
  await context.close();
});

test('a sheet that cannot load never hides the pause card: the Controls row puts it back at once', async ({ browser }) => {
  const context = await browser.newContext({ viewport: DESKTOP });
  const page = await context.newPage();
  // Only the chunk that holds the sheet layer fails ('controls-backdrop' is the layer's backdrop test id, in no other chunk): the
  // pause card's Controls row (its own chunk) still opens a sheet that never shows. The card hides while the sheet is open, so without
  // the fallback the player would be left with an empty paused screen.
  await page.route('**/_next/static/chunks/*.js', async route => {
    const res = await route.fetch(), body = await res.text();
    if (body.includes('controls-backdrop')) return route.abort('failed');
    return route.fulfill({ response: res, body });
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Ascend Mount Hermon' })).toBeEnabled({ timeout: 60000 });
  await page.getByRole('button', { name: 'Ascend Mount Hermon' }).click();
  await page.getByRole('button', { name: 'Pause expedition' }).click();
  const paused = page.getByRole('region', { name: 'Ascent paused' });
  await expect(paused).toBeVisible();
  const row = paused.getByTestId('controls-row');
  await expect(row).toBeVisible({ timeout: 15000 });
  await row.click();
  await expect(paused).toBeVisible(); // back after the flag resets
  await expect(page.getByTestId('controls-sheet')).toHaveCount(0);
  await paused.getByRole('button', { name: 'Resume flight' }).click();
  await expect(page.getByRole('button', { name: 'Pause expedition' })).toBeVisible();
  await context.close();
});
