import { expect, test, type Page } from '@playwright/test';
import { mockResults, playInit } from './controls-browser';
// The Field guide is a lazy chunk (src/ui/useFieldGuide.ts). System Chrome emulation: these check the wiring a player can see (the status
// line while it loads, the failure line, the retry on the next open, no stranded pause card), never how it behaves on a real phone.
type Mode = 'fail' | 'slow' | 'hold' | 'pass';
const GUIDE_COPY = /Explore through text/;
/** Serves every chunk, except the one carrying the guide copy: that one fails, arrives after a delay, waits until `release()` (so a test
 *  can act in the loading window for as long as it needs), or passes, as `mode.now` says. `served` counts the guide chunks handed over. */
async function guideChunk(page: Page, start: Mode) {
  const mode = { now: start }, requests: Mode[] = [], served = { n: 0 };
  let release = () => {};
  const held = new Promise<void>(done => { release = done; });
  await page.route('**/_next/static/chunks/*.js', async route => {
    const res = await route.fetch(), body = await res.text();
    if (!GUIDE_COPY.test(body)) return route.fulfill({ response: res, body });
    requests.push(mode.now);
    if (mode.now === 'fail') return route.abort('failed');
    if (mode.now === 'slow') await new Promise(done => setTimeout(done, 1500));
    if (mode.now === 'hold') await held;
    await route.fulfill({ response: res, body }); served.n++;
  });
  return { mode, requests, served, release: () => release() };
}
const FAILED = 'The field guide could not load. Try again.', LOADING = 'Opening field guide…';
const card = (page: Page) => page.getByRole('region', { name: 'Expedition paused' });
const begin = async (page: Page) => {
  const b = page.getByRole('button', { name: 'Begin expedition' });
  await expect(b).toBeEnabled({ timeout: 60000 }); await b.click();
  await expect(page.getByRole('button', { name: 'Pause expedition' })).toBeVisible();
};
/** Playing, the Field guide is on the pause card (the top row has no Field guide button): Pause first. */
const pauseThenGuide = async (page: Page) => {
  await page.getByRole('button', { name: 'Pause expedition' }).click();
  await card(page).getByRole('button', { name: 'Field guide', exact: true }).click();
};
const dialogOpen = (page: Page) => expect(page.getByRole('dialog').getByRole('heading', { name: 'Field guide' })).toBeVisible();

test('the guide chunk is warmed after hydration and the guide then opens at once', async ({ page }) => {
  const chunk = await guideChunk(page, 'pass');
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Begin expedition' })).toBeEnabled({ timeout: 60000 });
  await expect.poll(() => chunk.requests.length, { timeout: 10000 }).toBeGreaterThan(0);
  const before = chunk.requests.length;
  await page.getByRole('button', { name: 'Field guide', exact: true }).click();
  await dialogOpen(page);
  await expect(page.getByText('Explore through text')).toBeVisible();
  expect(chunk.requests.length, 'a warmed guide is held, not fetched again').toBe(before);
});

test('start card: a failed guide says so, nothing opens, and the next click retries', async ({ page }) => {
  const chunk = await guideChunk(page, 'fail');
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Begin expedition' })).toBeEnabled({ timeout: 60000 });
  const status = page.getByRole('region', { name: 'Begin expedition' }).getByRole('status');
  await page.getByRole('button', { name: 'Field guide', exact: true }).click();
  await expect(status).toHaveText(FAILED);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Begin expedition' })).toBeEnabled();
  chunk.mode.now = 'pass';
  await page.getByRole('button', { name: 'Field guide', exact: true }).click();
  await dialogOpen(page);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Begin expedition' })).toBeVisible();
  await expect(status).not.toHaveText(FAILED);
});

test('paused in play: loading and failure show in the pause card, which stays, and Resume still works', async ({ page }) => {
  const chunk = await guideChunk(page, 'fail');
  await page.goto('/?shooter=0'); await begin(page);
  await pauseThenGuide(page);
  // The failed open: the pause card is still there with its words and Resume, no dialog, no stranded game.
  await expect(card(page).getByRole('heading', { name: 'Take your time.' })).toBeVisible();
  await expect(card(page).getByRole('status')).toHaveText(FAILED);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const resume = card(page).getByRole('button', { name: 'Resume flight' });
  await expect(resume).toBeEnabled();
  // Retry on the next open (the flag went back to false, so this open is a fresh one): the card shows the loading line, then the guide.
  chunk.mode.now = 'slow';
  await card(page).getByRole('button', { name: 'Field guide', exact: true }).click();
  await expect(card(page).getByRole('status')).toHaveText(LOADING);
  await expect(card(page).getByRole('heading', { name: 'Take your time.' })).toBeVisible();
  await dialogOpen(page);
  await expect(card(page)).toHaveCount(0);
  // Closing returns to the pause card (Resume is the player's own tap); the guide is now held, so a later open needs no network at all.
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await expect(card(page).getByRole('heading', { name: 'Take your time.' })).toBeVisible();
  chunk.mode.now = 'fail';
  await card(page).getByRole('button', { name: 'Field guide', exact: true }).click();
  await dialogOpen(page);
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await expect(card(page).getByRole('heading', { name: 'Take your time.' })).toBeVisible();
  await card(page).getByRole('button', { name: 'Resume flight' }).click();
  await expect(page.getByRole('button', { name: 'Pause expedition' })).toBeVisible();
});

test('a failed open can be abandoned by Resume: the failure line does not outlive the pause, and play goes on', async ({ page }) => {
  await guideChunk(page, 'fail');
  await page.goto('/?shooter=0'); await begin(page);
  await pauseThenGuide(page);
  await expect(card(page).getByRole('status')).toHaveText(FAILED);
  await card(page).getByRole('button', { name: 'Resume flight' }).click();
  await expect(card(page)).toHaveCount(0);
  await page.keyboard.press('Space');
  await expect(page.getByTestId('flight-telemetry')).toHaveAttribute('data-flying', 'true');
  await page.getByRole('button', { name: 'Pause expedition' }).click();
  await expect(card(page).getByRole('heading', { name: 'Take your time.' })).toBeVisible();
  await expect(card(page).getByRole('status')).not.toHaveText(FAILED);
});

test('the skip link keeps its target and opens the guide once the chunk lands', async ({ page }) => {
  // The warm-up fails here, so the skip link's open is the one that has to fetch the chunk (slowly).
  const chunk = await guideChunk(page, 'fail');
  await page.goto('/?shooter=0'); await begin(page);
  chunk.mode.now = 'slow';
  await expect(page.locator('#field-guide'), 'the skip link target is kept').toHaveCount(1);
  await page.getByRole('link', { name: 'Skip to text field guide' }).focus(); await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#field-guide$/);
  await expect(card(page).getByRole('status')).toHaveText(LOADING);
  await dialogOpen(page);
  await expect(page.getByText('Explore through text')).toBeVisible();
});

// One screen at a time. While the guide chunk is on its way the pause card stays up (so the player sees `Opening field guide…`), which
// leaves every other door live. Whatever claims the screen in that window must cancel the pending open: when the chunk lands the guide
// may not pile a second dialog on top (before this, Escape then closed the guide, resumed play and silently discarded the other one).
const modals = (page: Page) => page.locator('dialog[open], [role="dialog"]');
/** Starts a held guide open from a paused card; `door` then claims the screen; the chunk is released and has landed before this returns. */
async function claimedWhileLoading(page: Page, door: () => Promise<void>, before: () => Promise<void> = async () => {}) {
  const chunk = await guideChunk(page, 'fail');
  await before();
  await page.goto('/?shooter=0'); await begin(page);
  chunk.mode.now = 'hold';
  await pauseThenGuide(page);
  await expect(card(page).getByRole('status')).toHaveText(LOADING);
  await door();
  chunk.release();
  await expect.poll(() => chunk.served.n, { timeout: 10000 }).toBeGreaterThan(0);
  // Two animation frames past the chunk landing: a late guide would have mounted by now.
  await page.evaluate(() => new Promise<void>(done => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
  return chunk;
}

test('Flight settings in the loading window cancels the guide: one dialog, and the guide still opens later', async ({ page }) => {
  const chunk = await claimedWhileLoading(page, async () => {
    await card(page).getByRole('button', { name: 'Flight settings', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Flight settings' })).toBeVisible();
  });
  await expect(modals(page)).toHaveCount(1);
  await expect(page.getByRole('dialog', { name: 'Flight settings' })).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Field guide' })).toHaveCount(0);
  // Closing the settings leaves nothing behind: no guide underneath, and the held chunk now opens the guide at once.
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await expect(modals(page)).toHaveCount(0);
  await expect(card(page).getByRole('heading', { name: 'Take your time.' })).toBeVisible();
  chunk.mode.now = 'fail';
  await card(page).getByRole('button', { name: 'Field guide', exact: true }).click();
  await dialogOpen(page);
  await expect(modals(page)).toHaveCount(1);
});

// The header gear and the header Vote pill are not on the paused screen any more, so the pause card's own doors (Flight settings above, the vote door
// below) are the ones that can claim the screen while the guide loads. The vote door is only there once the vote works: two ways flown, an open ballot.

test('the vote door in the loading window cancels the guide: one dialog, and closing it puts the pause card back', async ({ page }) => {
  await claimedWhileLoading(page, async () => {
    await card(page).getByTestId('vote-open').click();
    await expect(page.getByTestId('vote-card')).toBeVisible();
  }, async () => { await page.addInitScript(playInit({ 'desktop:cursor': 25, 'desktop:draw': 25 })); await mockResults(page); });
  await expect(modals(page)).toHaveCount(1);
  await expect(page.getByTestId('vote-card')).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Field guide' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(modals(page)).toHaveCount(0);
  await expect(card(page).getByRole('heading', { name: 'Take your time.' })).toBeVisible();
});
