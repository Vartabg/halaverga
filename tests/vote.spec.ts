import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type Route } from '@playwright/test';
import { labPage, lift, tel } from './lab-browser';
// The in-game vote (spec 3.2), system Chrome emulation. /api/vote and /api/results are always mocked with page.route: no test
// ever reaches a real database. Run against a production build: PLAYTEST_URL=http://127.0.0.1:3391 (never 3368 or 3380).
const DESK = { width: 1440, height: 900 }, PHONE_PORTRAIT = { width: 393, height: 852 };
const RESULTS = { round: 'r1', total: 5, favorite: { standard: 1, draw: 3, conduct: 0, brush: 1 } };
const card = (p: Page) => p.getByTestId('vote-card');
const paused = (p: Page) => p.getByRole('region', { name: 'Expedition paused' });
type Reply = number | 'abort';
/** Mocks both endpoints; /api/vote answers with each reply in turn (the last one repeats). Returns the vote request bodies. */
async function mock(page: Page, replies: Reply[]) {
  const bodies: unknown[] = [];
  await page.route('**/api/results', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(RESULTS) }));
  await page.route('**/api/vote', async (r: Route) => {
    bodies.push(r.request().postDataJSON());
    const reply = replies[Math.min(bodies.length - 1, replies.length - 1)];
    if (reply === 'abort') return r.abort('failed');
    const error = reply === 429 ? 'too-many' : reply === 503 ? 'voting-not-set-up' : undefined;
    return r.fulfill({ status: reply, contentType: 'application/json', body: JSON.stringify(reply === 200 ? { ok: true } : { ok: false, error }) });
  });
  return bodies;
}
/** Eligible to vote: two styles over 30 s and over 180 s in all, never voted, never skipped. */
function seedEligible() {
  localStorage.setItem('halaverga.vote.play.v1', JSON.stringify({ round: 'r1', secs: { standard: 150, draw: 60, conduct: 0, brush: 0 } }));
}
async function openFromPause(page: Page, touch = false) {
  const pauseButton = page.getByRole('button', { name: 'Pause expedition' });
  if (touch) await pauseButton.tap(); else await pauseButton.click();
  await expect(paused(page)).toBeVisible();
  const open = page.getByTestId('vote-open');
  if (touch) await open.tap(); else await open.click();
  await expect(card(page)).toBeVisible();
  await expect(card(page).getByRole('heading', { name: 'Which controls did you like?' })).toBeFocused();
}
/** Land from a hover: Land needs a flat surface under the reticle, so drag to look down at the ground first (trackpad.spec). */
async function land(page: Page) {
  await page.mouse.move(720, 450); await page.mouse.down(); await page.mouse.move(720, 800, { steps: 15 }); await page.mouse.up();
  await expect(page.getByText('SURFACE IN REACH · LAND')).toBeVisible();
  await page.getByRole('button', { name: 'Land', exact: true }).click();
}
async function pickAndSend(page: Page) {
  const send = card(page).getByRole('button', { name: 'Send vote' });
  await expect(send).toBeDisabled();
  await card(page).getByTestId('vote-favorite').getByRole('radio', { name: 'Standard', exact: true }).check();
  await card(page).getByTestId('vote-rating-standard').getByRole('radio', { name: '4', exact: true }).check();
  await send.click();
}

test("the pause card's Vote on the controls opens the card; a 200 shows thanks and the tally, and sends only the answers", async ({ browser }) => {
  const t = await labPage(browser, 'standard', { viewport: DESK }), { page } = t, bodies = await mock(page, [200]);
  await openFromPause(page);
  await expect(paused(page)).toHaveCount(0);
  await pickAndSend(page);
  await expect(card(page).getByRole('status')).toHaveText('Thanks, your vote is counted.');
  await expect(card(page).getByTestId('vote-tally')).toHaveText('Favorites so far: Draw 3 · Standard 1 · Brush 1');
  expect(bodies).toHaveLength(1);
  expect(Object.keys(bodies[0] as object).sort()).toEqual(['build', 'device', 'favorite', 'nonce', 'ratings', 'tried']);
  expect((bodies[0] as { nonce: string }).nonce).toMatch(/^[0-9a-f-]{16,64}$/); // a random send code, nothing about the player
  expect(bodies[0]).toMatchObject({ favorite: 'standard', ratings: { standard: 4 }, device: 'desktop' });
  await card(page).getByRole('button', { name: 'Done' }).click();
  await expect(paused(page)).toBeVisible();
  // Voted: a later open thanks instead of offering a second vote.
  await page.getByTestId('vote-open').click();
  await expect(card(page).getByTestId('vote-favorite')).toHaveCount(0);
  expect(t.errors).toEqual([]); await t.context.close();
});

test('a 429 says too many votes, keeps the answers, and a later open still offers voting', async ({ browser }) => {
  const t = await labPage(browser, 'standard', { viewport: DESK }), { page } = t, bodies = await mock(page, [429]);
  await openFromPause(page);
  await pickAndSend(page);
  await expect(card(page).getByRole('status')).toHaveText(/^Too many votes from this network/);
  await expect(card(page).getByRole('button', { name: 'Try again' })).toBeEnabled();
  await expect(card(page).getByRole('radio', { name: 'Standard', exact: true })).toBeChecked();
  expect(bodies).toHaveLength(1); // no automatic retry
  await card(page).getByRole('button', { name: 'Skip' }).click();
  await expect(paused(page)).toBeVisible();
  await page.getByTestId('vote-open').click();
  await expect(card(page).getByRole('button', { name: 'Send vote' })).toBeVisible();
  expect(t.errors).toEqual([]); await t.context.close();
});

test("a 503 says voting isn't open", async ({ browser }) => {
  const t = await labPage(browser, 'standard', { viewport: DESK }), { page } = t;
  await mock(page, [503]);
  await openFromPause(page);
  await pickAndSend(page);
  await expect(card(page).getByRole('status')).toHaveText(/isn't open/);
  expect(t.errors).toEqual([]); await t.context.close();
});

test('a first aborted request is retried once and then counts', async ({ browser }) => {
  const t = await labPage(browser, 'standard', { viewport: DESK }), { page } = t, bodies = await mock(page, ['abort', 200]);
  await openFromPause(page);
  await pickAndSend(page);
  await expect(card(page).getByRole('status')).toHaveText('Thanks, your vote is counted.', { timeout: 10000 });
  expect(bodies).toHaveLength(2);
  expect(t.errors).toEqual([]); await t.context.close();
});

test('Skip (and Escape) from a pause-card open returns to the pause card', async ({ browser }) => {
  const t = await labPage(browser, 'standard', { viewport: DESK }), { page } = t;
  await mock(page, [200]);
  await openFromPause(page);
  await card(page).getByRole('button', { name: 'Skip' }).click();
  await expect(card(page)).toHaveCount(0);
  await expect(paused(page)).toBeVisible();
  await page.getByTestId('vote-open').click();
  await expect(card(page).getByRole('heading')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(card(page)).toHaveCount(0);
  await expect(paused(page)).toBeVisible();
  expect(t.errors).toEqual([]); await t.context.close();
});

test('eligible: a landing auto-opens the card and pauses, an early tap does nothing, and Skip then resumes play', async ({ browser }) => {
  const t = await labPage(browser, 'standard', { viewport: DESK, init: seedEligible }), { page } = t;
  await mock(page, [200]);
  await lift(page);
  await land(page);
  // Wait on the card itself (not the 350 ms telemetry stamp), so the probe below runs inside the 400 ms guard.
  await card(page).waitFor({ state: 'visible', timeout: 30000 });
  // Within the guard, a pointer at Skip reaches the scrim, never the button; a real click there changes nothing.
  const probe = await page.evaluate(() => {
    const c = document.querySelector('[data-testid=vote-card]')!, skip = [...c.querySelectorAll('button')].find(b => b.textContent === 'Skip')!;
    const r = skip.getBoundingClientRect(), x = r.x + r.width / 2, y = r.y + r.height / 2;
    return { guard: c.hasAttribute('data-guard'), hit: document.elementFromPoint(x, y) === skip, x, y };
  });
  expect(probe.guard).toBe(true);
  expect(probe.hit).toBe(false);
  await page.mouse.click(probe.x, probe.y);
  await expect(card(page)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pause expedition' })).toHaveCount(0); // auto-open paused the game
  await expect(card(page)).not.toHaveAttribute('data-guard', /.*/);
  await card(page).getByRole('button', { name: 'Skip' }).click();
  await expect(card(page)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Pause expedition' })).toBeVisible();
  // Once per page load (and Skip is quiet for 24 h): another landing does not reopen it.
  await lift(page);
  await land(page);
  await expect.poll(async () => (await tel(page)).flying, { timeout: 30000 }).toBe(false);
  await page.waitForTimeout(500);
  await expect(card(page)).toHaveCount(0);
  expect(t.errors).toEqual([]); await t.context.close();
});

test('opening the pause card yourself never auto-opens the vote, even when eligible', async ({ browser }) => {
  const t = await labPage(browser, 'standard', { viewport: DESK, init: seedEligible }), { page } = t;
  await mock(page, [200]);
  await lift(page);
  await page.keyboard.press('Escape');
  await expect(paused(page)).toBeVisible();
  await page.waitForTimeout(1500);
  await expect(card(page)).toHaveCount(0);
  // Eligible without a landing (review 2026-09-25: over water a player may never land): the pause card leads with the ask.
  await expect(paused(page).getByText('You tried more than one style. Which did you like?')).toBeVisible();
  await expect(page.getByTestId('vote-open')).toHaveAttribute('data-nudge', '');
  expect(t.errors).toEqual([]); await t.context.close();
});

for (const [name, viewport, touch] of [['393x852 touch', PHONE_PORTRAIT, true], ['1440x900 desktop', DESK, false]] as const) {
  test(`the vote card passes axe WCAG AA at ${name}`, async ({ browser }) => {
    const t = await labPage(browser, 'standard', { viewport, touch }), { page } = t;
    await mock(page, [200]);
    await openFromPause(page, touch);
    const scan = await new AxeBuilder({ page }).include('[data-testid=vote-layer]').withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(scan.violations).toEqual([]);
    expect(t.errors).toEqual([]); await t.context.close();
  });
}

test('the card is a modal dialog: the keyboard cannot leave it or switch styles behind it, and Skip restores the page', async ({ browser }) => {
  // Review 2026-09-25: Shift+Tab from the heading reached the header's lab bar, and an arrow key there switched the scheme.
  const t = await labPage(browser, 'standard', { viewport: DESK }), { page } = t;
  await mock(page, [200]);
  await openFromPause(page);
  await expect(page.getByRole('dialog', { name: 'Which controls did you like?' })).toBeVisible();
  await expect(page.locator('header')).toHaveAttribute('inert', '');
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Shift+Tab');
    expect(await page.evaluate(() => !!document.activeElement?.closest('[data-testid=vote-card]') || document.activeElement === document.body)).toBe(true);
  }
  await page.keyboard.press('ArrowRight');
  expect(await page.evaluate(() => document.documentElement.dataset.controls ?? null)).toBeNull();
  await card(page).getByRole('button', { name: 'Skip' }).click();
  await expect(card(page)).toHaveCount(0);
  await expect(page.locator('header')).not.toHaveAttribute('inert', '');
  await expect(paused(page)).toBeVisible();
  expect(t.errors).toEqual([]); await t.context.close();
});

test('667x375: Send vote stays on screen while the card scrolls (sticky, with a shadow as the scroll cue)', async ({ browser }) => {
  const t = await labPage(browser, 'standard', { viewport: { width: 667, height: 375 }, touch: true }), { page } = t;
  await mock(page, [200]);
  await openFromPause(page, true);
  const send = card(page).getByRole('button', { name: 'Send vote' });
  const inView = async () => { const b = (await send.boundingBox())!; return b.y >= 0 && b.y + b.height <= 375; };
  expect(await inView()).toBe(true);
  await page.getByTestId('vote-layer').evaluate(e => { e.scrollTop = e.scrollHeight; });
  expect(await inView()).toBe(true);
  expect(t.errors).toEqual([]); await t.context.close();
});
