import { expect, test, type Page } from '@playwright/test';
import { DESKTOP, controlsPage, mockVote, openSheet, playInit, row, sheet, trigger } from './controls-browser';
// Fixes from the 2026-09-28 controls-picker review: touch scroll in the sheet and the vote card, the vote pausing the game it opens
// over, a vote that needs some play, and a failed lazy chunk leaving the page standing. System Chrome emulation (touch emulation for
// the phone rows), never an iPhone. /api/vote and /api/results are always mocked. Run against a production build on port 3391 only.
const LANDSCAPE = { width: 852, height: 393 }, SHORT = { width: 750, height: 340 };
const playing = (p: Page) => p.locator('button[aria-label="Pause expedition"]');
const card = (p: Page) => p.getByTestId('vote-card');
const scrollTop = (p: Page, testid: string) => p.getByTestId(testid).evaluate(e => e.scrollTop);
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
    const scroller = await sheet(page).evaluate(e => ({ over: e.scrollHeight - e.clientHeight }));
    await watchMoves(page);
    test.info().annotations.push({ type: 'overflow', description: String(scroller.over) });
    if (scroller.over > 0) {
      // Swipe up from the middle of the list: the finger must move the sheet, and the guard must not cancel it.
      await finger.down({ x: box.x + box.width / 2, y: box.y + box.height * .6 });
      await finger.drag({ x: box.x + box.width / 2, y: box.y + 20 }, 12);
      await finger.up();
      await expect.poll(() => scrollTop(page, 'controls-sheet')).toBeGreaterThan(0);
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

test('the sheet Vote button pauses the game behind the card; Keep playing resumes it', async ({ browser }) => {
  const t = await controlsPage(browser, 'standard', { viewport: DESKTOP }), { page } = t;
  await mockVote(page);
  await openSheet(page);
  await expect(playing(page)).toHaveCount(1);
  await sheet(page).getByRole('button', { name: 'Vote on the controls' }).click();
  await expect(card(page)).toBeVisible();
  await expect(playing(page)).toHaveCount(0); // paused: W A S D from the card's buttons cannot fly the suit
  await card(page).getByRole('button', { name: 'Keep playing' }).click();
  await expect(card(page)).toHaveCount(0);
  await expect(playing(page)).toHaveCount(1);
  expect(t.errors).toEqual([]); await t.context.close();
});

test('vote card on a phone in landscape scrolls by touch, and Send stays reachable', async ({ browser }) => {
  const t = await controlsPage(browser, 'standard', { touch: true, viewport: LANDSCAPE, init: playInit({ 'touch:one-finger': 60, 'touch:draw': 60 }) }), { page, finger } = t;
  await mockVote(page);
  await openSheet(page, true);
  await sheet(page).getByRole('button', { name: 'Vote on the controls' }).tap();
  await expect(card(page)).toBeVisible();
  await expect(playing(page)).toHaveCount(0);
  await expect(card(page).getByTestId('vote-favorite')).toBeVisible();
  expect(await page.getByTestId('vote-layer').evaluate(e => e.scrollHeight > e.clientHeight)).toBe(true);
  await finger.down({ x: 426, y: 300 }); await finger.drag({ x: 426, y: 60 }, 12); await finger.up();
  await expect.poll(() => scrollTop(page, 'vote-layer')).toBeGreaterThan(0);
  await expect(card(page).getByRole('textbox')).toBeInViewport();
  await t.context.close();
});

test('a vote needs play: a fresh visitor sees no form, and Skip is not recorded; after 20 s the played control is offered', async ({ browser }) => {
  const fresh = await controlsPage(browser, 'standard', { viewport: DESKTOP });
  await mockVote(fresh.page);
  await openSheet(fresh.page);
  await fresh.page.getByTestId('controls-vote').click();
  await expect(card(fresh.page).getByTestId('vote-nothing')).toContainText('20 seconds');
  await expect(card(fresh.page).getByRole('button', { name: 'Send vote' })).toHaveCount(0);
  await expect(card(fresh.page).getByTestId('vote-favorite')).toHaveCount(0);
  await card(fresh.page).getByRole('button', { name: 'Keep playing' }).click();
  expect(await fresh.page.evaluate(() => localStorage.getItem('halaverga.vote.v1'))).toBeNull(); // no Skip mark, no vote mark
  expect(fresh.errors).toEqual([]); await fresh.context.close();

  const played = await controlsPage(browser, 'standard', { viewport: DESKTOP, init: playInit({ 'desktop:cursor': 25 }) });
  const bodies: unknown[] = [];
  await mockVote(played.page);
  await played.page.route('**/api/vote', r => { bodies.push(r.request().postDataJSON()); return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }); });
  await openSheet(played.page);
  await played.page.getByTestId('controls-vote').click();
  await expect(card(played.page).getByTestId('vote-tried')).toContainText('Tried 1 of 8');
  await card(played.page).getByRole('radio', { name: 'Cursor' }).first().check();
  await card(played.page).getByRole('button', { name: 'Send vote' }).click();
  await expect(card(played.page).getByRole('status')).toContainText('vote is counted');
  expect(bodies).toHaveLength(1);
  expect(bodies[0]).toMatchObject({ favorite: 'cursor', tried: ['cursor'], device: 'desktop' });
  // The desktop vote does not lock the touch family (one mark per family).
  const mark = await played.page.evaluate(() => JSON.parse(localStorage.getItem('halaverga.vote.v1') ?? '{}'));
  expect(typeof mark.desktop?.at).toBe('number'); expect(mark.touch).toBeUndefined();
  await played.context.close();
});

test('a failed picker or vote chunk leaves the page standing: Begin, the Field guide and play still work', async ({ browser }) => {
  const context = await browser.newContext({ viewport: DESKTOP });
  const page = await context.newPage();
  // Abort every lazy chunk that carries the picker, the vote card or the controls list.
  await page.route('**/_next/static/chunks/*.js', async route => {
    const res = await route.fetch(), body = await res.text();
    if (/controls-trigger|Try every control|Which controls did you like/.test(body)) return route.abort('failed');
    return route.fulfill({ response: res, body });
  });
  await page.goto('/');
  const begin = page.getByRole('button', { name: 'Begin expedition' });
  await expect(begin).toBeEnabled({ timeout: 60000 });
  await page.getByRole('button', { name: 'Field guide' }).click();
  await expect(page.getByRole('heading', { name: 'Field guide' })).toBeVisible();
  await expect(page.getByText('Try every control')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(begin).toBeVisible();
  await begin.click();
  await expect(page.getByRole('button', { name: 'Pause expedition' })).toBeVisible();
  await expect(trigger(page)).toHaveCount(0);
  await context.close();
});
