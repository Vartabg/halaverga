import { expect, test, type Page } from '@playwright/test';
// The Field guide is a lazy chunk (src/ui/useFieldGuide.ts). System Chrome emulation: these check the wiring a player can see (the status
// line while it loads, the failure line, the retry on the next open, no stranded pause card), never how it behaves on a real phone.
type Mode = 'fail' | 'slow' | 'pass';
const GUIDE_COPY = /Explore through text/;
/** Serves every chunk, except the one carrying the guide copy: that one fails, arrives after a delay, or passes, as `mode.now` says. */
async function guideChunk(page: Page, start: Mode) {
  const mode = { now: start }, requests: Mode[] = [];
  await page.route('**/_next/static/chunks/*.js', async route => {
    const res = await route.fetch(), body = await res.text();
    if (!GUIDE_COPY.test(body)) return route.fulfill({ response: res, body });
    requests.push(mode.now);
    if (mode.now === 'fail') return route.abort('failed');
    if (mode.now === 'slow') await new Promise(done => setTimeout(done, 1500));
    return route.fulfill({ response: res, body });
  });
  return { mode, requests };
}
const FAILED = 'The field guide could not load. Try again.', LOADING = 'Opening field guide…';
const card = (page: Page) => page.getByRole('region', { name: 'Expedition paused' });
const begin = async (page: Page) => {
  const b = page.getByRole('button', { name: 'Begin expedition' });
  await expect(b).toBeEnabled({ timeout: 60000 }); await b.click();
  await expect(page.getByRole('button', { name: 'Pause expedition' })).toBeVisible();
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
  await page.getByRole('button', { name: 'Field guide', exact: true }).click();
  // The failed open: the pause card is still there with its words and Resume, no dialog, no stranded game.
  await expect(card(page).getByRole('heading', { name: 'Take your time.' })).toBeVisible();
  await expect(card(page).getByRole('status')).toHaveText(FAILED);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const resume = card(page).getByRole('button', { name: 'Resume flight' });
  await expect(resume).toBeEnabled();
  // Retry on the next open (the flag went back to false, so this open is a fresh one): the card shows the loading line, then the guide.
  chunk.mode.now = 'slow';
  await page.getByRole('button', { name: 'Field guide', exact: true }).click();
  await expect(card(page).getByRole('status')).toHaveText(LOADING);
  await expect(card(page).getByRole('heading', { name: 'Take your time.' })).toBeVisible();
  await dialogOpen(page);
  await expect(card(page)).toHaveCount(0);
  // Closing returns to play (this unit keeps that); the guide is now held, so a later open needs no network at all.
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await expect(page.getByRole('button', { name: 'Pause expedition' })).toBeVisible();
  chunk.mode.now = 'fail';
  await page.getByRole('button', { name: 'Pause expedition' }).click();
  await page.getByRole('button', { name: 'Field guide', exact: true }).click();
  await dialogOpen(page);
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await expect(page.getByRole('button', { name: 'Pause expedition' })).toBeVisible();
});

test('a failed open can be abandoned by Resume: the failure line does not outlive the pause, and play goes on', async ({ page }) => {
  await guideChunk(page, 'fail');
  await page.goto('/?shooter=0'); await begin(page);
  await page.getByRole('button', { name: 'Field guide', exact: true }).click();
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
