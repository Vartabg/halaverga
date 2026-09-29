import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type Route } from '@playwright/test';
import { labPage, lift, tel } from './lab-browser';
// The in-game vote for every control type (spec 3.2, schema 2), system Chrome emulation. /api/vote and /api/results are always
// mocked with page.route: no test ever reaches a real database. Run against a production build:
// PLAYTEST_URL=http://127.0.0.1:3391 (never 3368 or 3380). Written by the vote unit and executed by the integration unit, once the
// Controls picker (header trigger 'Controls: <label>' and its sheet) is mounted. Emulation is not iPhone or trackpad validation.
const DESK = { width: 1440, height: 900 }, PHONE_PORTRAIT = { width: 393, height: 852 };
const row = (favorite: number, votes: number) => ({ favorite, share: votes ? Math.round(100 * favorite / votes) : 0, tried: favorite, rating: { avg: null, n: 0 } });
const RESULTS = { v: 2, round: 'r2', total: 6, notes: 0, stale: 0, builds: {}, families: {
  touch: { votes: 2, controls: { 'one-finger': row(1, 2), 'twin-stick': row(0, 2), draw: row(1, 2), conduct: row(0, 2), brush: row(0, 2) } },
  desktop: { votes: 4, controls: { cursor: row(4, 4), 'one-finger-keys': row(0, 4), flow: row(0, 4), captured: row(0, 4), 'mouse-keys': row(0, 4), draw: row(2, 4), conduct: row(0, 4), brush: row(0, 4) } },
} };
const PLAY_KEY = 'halaverga.vote.play.v2';
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
    const error = reply === 429 ? 'too-many' : reply === 503 ? 'voting-not-set-up' : reply === 400 ? 'bad-vote' : undefined;
    return r.fulfill({ status: reply, contentType: 'application/json', body: JSON.stringify(reply === 200 ? { ok: true } : { ok: false, error }) });
  });
  return bodies;
}
/** Seeds the v2 play record (seconds by 'family:id'), round r2, never voted, never skipped. */
function seed(secs: Record<string, number>) {
  // addInitScript serialises the function source, so a closure over `secs` would be undefined in the page: embed the record instead.
  const record = JSON.stringify(JSON.stringify({ round: 'r2', secs }));
  return new Function(`localStorage.setItem('halaverga.vote.play.v2', ${record});`) as () => void;
}
/** Desktop played Cursor and Draw only: the card offers exactly those two (Cursor is the current control). */
const seedDesktopTwo = seed({ 'desktop:cursor': 150, 'desktop:draw': 60 });
/** Phone played One finger and Draw only. */
const seedTouchTwo = seed({ 'touch:one-finger': 150, 'touch:draw': 60 });
/** Three tried controls and over 180 s: the pause-card nudge is on, the auto-open is not (it needs every control). */
const seedDesktopThree = seed({ 'desktop:cursor': 100, 'desktop:draw': 60, 'desktop:flow': 40 });
/** Every desktop control tried (8 x 25 s = 200 s): the auto-open on a landing. */
const seedDesktopAll = seed(Object.fromEntries(['cursor', 'one-finger-keys', 'flow', 'captured', 'mouse-keys', 'draw', 'conduct', 'brush'].map(id => [`desktop:${id}`, 25])));
const close = (p: Page) => card(p).getByRole('button', { name: /^(Skip|Not yet)$/ });
/** Total play seconds in the saved record (the layer saves on pagehide; fire it to flush). */
async function playedSecs(page: Page) {
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  return page.evaluate(key => {
    const o = JSON.parse(localStorage.getItem(key) ?? '{"secs":{}}') as { secs: Record<string, number> };
    return Object.values(o.secs).reduce((a, b) => a + b, 0);
  }, PLAY_KEY);
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
  // Land glides to the surface under the reticle, so it is clicked only once the look-down has settled. Under load the hint can
  // show mid-drag, and a landing from a half-turned view ends a few metres forward, where the next landing finds no flat ground.
  await expect.poll(async () => (await tel(page)).pitch).toBeLessThan(-1.1);
  await expect(page.getByText('SURFACE IN REACH · LAND')).toBeVisible();
  await page.getByRole('button', { name: 'Land', exact: true }).click();
}
async function pickAndSend(page: Page, favorite = 'Cursor', id = 'cursor') {
  const send = card(page).getByRole('button', { name: 'Send vote' });
  await expect(send).toBeDisabled();
  await card(page).getByTestId('vote-favorite').getByRole('radio', { name: favorite, exact: true }).check();
  await card(page).getByTestId(`vote-rating-${id}`).getByRole('radio', { name: '4', exact: true }).check();
  await send.click();
}

test("the pause card's Vote on the controls offers only the tried controls of the family, sends v2 answers, and shows thanks and the family tally", async ({ browser }) => {
  const t = await labPage(browser, 'standard', { viewport: DESK, init: seedDesktopTwo }), { page } = t, bodies = await mock(page, [200]);
  await openFromPause(page);
  await expect(paused(page)).toHaveCount(0);
  // Desktop: Cursor (current) and Draw were played; nothing else is offered, and none of the touch controls ever is.
  const favorites = card(page).getByTestId('vote-favorite').getByRole('radio');
  await expect(favorites).toHaveCount(2);
  await expect(card(page).getByTestId('vote-favorite').locator('label')).toHaveText(['Cursor', 'Draw']);
  await expect(card(page).getByTestId('vote-tried')).toContainText('Tried 2 of 8.');
  await expect(card(page).getByTestId('vote-tried')).toContainText('Not tried yet: One finger + keys, Flow, Captured, Mouse + keys, Conduct, Brush. You can keep playing and vote later.');
  await expect(close(page)).toHaveText('Not yet');
  await pickAndSend(page);
  await expect(card(page).getByRole('status')).toHaveText('Thanks, your vote is counted.');
  await expect(card(page).getByTestId('vote-tally')).toHaveText('Favorites so far on desktop: Cursor 4 · Draw 2');
  expect(bodies).toHaveLength(1);
  expect(Object.keys(bodies[0] as object).sort()).toEqual(['build', 'device', 'favorite', 'nonce', 'ratings', 'tried', 'v']);
  expect((bodies[0] as { nonce: string }).nonce).toMatch(/^[0-9a-f-]{16,64}$/); // a random send code, nothing about the player
  expect(bodies[0]).toMatchObject({ v: 2, favorite: 'cursor', ratings: { cursor: 4 }, tried: ['cursor', 'draw'], device: 'desktop' });
  await card(page).getByRole('button', { name: 'Done' }).click();
  await expect(paused(page)).toBeVisible();
  // Voted: a later open thanks instead of offering a second vote.
  await page.getByTestId('vote-open').click();
  await expect(card(page).getByTestId('vote-favorite')).toHaveCount(0);
  expect(t.errors).toEqual([]); await t.context.close();
});

test('phone emulation: the card offers One finger and Draw, sends touch answers, and the tally line is the touch one', async ({ browser }) => {
  const t = await labPage(browser, 'standard', { viewport: PHONE_PORTRAIT, touch: true, init: seedTouchTwo }), { page } = t, bodies = await mock(page, [200]);
  await openFromPause(page, true);
  await expect(card(page).getByTestId('vote-favorite').locator('label')).toHaveText(['One finger', 'Draw']);
  await expect(card(page).getByTestId('vote-tried')).toContainText('Tried 2 of 5.');
  await pickAndSend(page, 'One finger', 'one-finger');
  await expect(card(page).getByRole('status')).toHaveText('Thanks, your vote is counted.');
  await expect(card(page).getByTestId('vote-tally')).toHaveText('Favorites so far on touch: One finger 1 · Draw 1');
  expect(bodies[0]).toMatchObject({ v: 2, favorite: 'one-finger', ratings: { 'one-finger': 4 }, tried: ['one-finger', 'draw'], device: 'touch' });
  expect(t.errors).toEqual([]); await t.context.close();
});

// playedSecs() flushes the record with a pagehide event, which (like leaving the page) pauses the game: it is read once, at the end.
test('an idle session that only opens the sheet and steps through the controls accrues no tried time', async ({ browser }) => {
  const t = await labPage(browser, 'standard', { viewport: DESK, init: seed({}) }), { page } = t;
  await mock(page, [200]);
  await page.getByRole('button', { name: /^Controls/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Controls' });
  await expect(sheet).toBeVisible();
  await page.waitForTimeout(2600); // the Begin click is outside the 2 s input window by now; the trigger click is the header's, not game input
  // Tab through the radios and rest the pointer on the sheet: dialog events are not game input.
  for (let i = 0; i < 4; i++) { await page.keyboard.press('Tab'); await page.waitForTimeout(150); }
  await sheet.hover();
  await page.waitForTimeout(3600);
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
  await page.waitForTimeout(2600);
  // Over 9 s passed since Begin: had the sheet counted, the record would hold several seconds. Begin's own press may count up to 2.
  expect(await playedSecs(page)).toBeLessThanOrEqual(2);
  expect(t.errors).toEqual([]); await t.context.close();
});

test('a key held in the scene is input: the current control accrues tried seconds', async ({ browser }) => {
  const t = await labPage(browser, 'standard', { viewport: DESK, init: seed({}) }), { page } = t;
  await mock(page, [200]);
  await page.waitForTimeout(2600); // Begin's own press is outside the 2 s window
  await page.keyboard.down('ArrowRight'); await page.waitForTimeout(3600); await page.keyboard.up('ArrowRight');
  // Begin's press may have counted up to 2 s, so 3 or more means the held key counted.
  expect(await playedSecs(page)).toBeGreaterThanOrEqual(3);
  expect(t.errors).toEqual([]); await t.context.close();
});

test('a 429 says too many votes, keeps the answers, and a later open still offers voting', async ({ browser }) => {
  const t = await labPage(browser, 'standard', { viewport: DESK, init: seedDesktopTwo }), { page } = t, bodies = await mock(page, [429]);
  await openFromPause(page);
  await pickAndSend(page);
  await expect(card(page).getByRole('status')).toHaveText(/^Too many votes from this network/);
  await expect(card(page).getByRole('button', { name: 'Try again' })).toBeEnabled();
  await expect(card(page).getByRole('radio', { name: 'Cursor', exact: true })).toBeChecked();
  expect(bodies).toHaveLength(1); // no automatic retry
  await close(page).click();
  await expect(paused(page)).toBeVisible();
  await page.getByTestId('vote-open').click();
  await expect(card(page).getByRole('button', { name: 'Send vote' })).toBeVisible();
  expect(t.errors).toEqual([]); await t.context.close();
});

test("a 503 says voting isn't open", async ({ browser }) => {
  const t = await labPage(browser, 'standard', { viewport: DESK, init: seedDesktopTwo }), { page } = t;
  await mock(page, [503]);
  await openFromPause(page);
  await pickAndSend(page);
  await expect(card(page).getByRole('status')).toHaveText(/isn't open/);
  expect(t.errors).toEqual([]); await t.context.close();
});

test('a 400 (an old tab with the old vote shape) tells the player to reload the page', async ({ browser }) => {
  const t = await labPage(browser, 'standard', { viewport: DESK, init: seedDesktopTwo }), { page } = t, bodies = await mock(page, [400]);
  await openFromPause(page);
  await pickAndSend(page);
  await expect(card(page).getByRole('status')).toHaveText('Something went wrong with this vote. Reload the page and try again.');
  expect(bodies).toHaveLength(1);
  expect(t.errors).toEqual([]); await t.context.close();
});

test('a first aborted request is retried once and then counts', async ({ browser }) => {
  const t = await labPage(browser, 'standard', { viewport: DESK, init: seedDesktopTwo }), { page } = t, bodies = await mock(page, ['abort', 200]);
  await openFromPause(page);
  await pickAndSend(page);
  await expect(card(page).getByRole('status')).toHaveText('Thanks, your vote is counted.', { timeout: 10000 });
  expect(bodies).toHaveLength(2);
  expect((bodies[1] as { nonce: string }).nonce).toBe((bodies[0] as { nonce: string }).nonce); // the retry is the same Send
  expect(t.errors).toEqual([]); await t.context.close();
});

test('Not yet (and Escape) from a pause-card open returns to the pause card', async ({ browser }) => {
  const t = await labPage(browser, 'standard', { viewport: DESK, init: seedDesktopTwo }), { page } = t;
  await mock(page, [200]);
  await openFromPause(page);
  await close(page).click();
  await expect(card(page)).toHaveCount(0);
  await expect(paused(page)).toBeVisible();
  await page.getByTestId('vote-open').click();
  await expect(card(page).getByRole('heading')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(card(page)).toHaveCount(0);
  await expect(paused(page)).toBeVisible();
  expect(t.errors).toEqual([]); await t.context.close();
});

test('eligible (every desktop control tried): a landing auto-opens the card and pauses, an early tap does nothing, and Skip then resumes play', async ({ browser }) => {
  const t = await labPage(browser, 'standard', { viewport: DESK, init: seedDesktopAll }), { page } = t;
  await mock(page, [200]);
  await lift(page);
  await land(page);
  // A finger already down when the card opens keeps the guard on (up to GUARD_MAX_MS), so the early tap below does not depend on how
  // fast this script reacts: under load the fixed 400 ms window could pass before the probe and the click ran.
  await page.mouse.move(720, 450); await page.mouse.down();
  await card(page).waitFor({ state: 'visible', timeout: 30000 });
  // With the guard on, a pointer at Skip reaches the scrim, never the button; releasing over it changes nothing.
  const probe = await page.evaluate(() => {
    const c = document.querySelector('[data-testid=vote-card]')!, skip = [...c.querySelectorAll('button')].find(b => b.textContent === 'Skip')!;
    const r = skip.getBoundingClientRect(), x = r.x + r.width / 2, y = r.y + r.height / 2;
    return { guard: c.hasAttribute('data-guard'), hit: document.elementFromPoint(x, y) === skip, x, y };
  });
  await expect(card(page).getByTestId('vote-tried')).toHaveText('Tried 8 of 8.');
  await expect(close(page)).toHaveText('Skip');
  expect(probe.guard).toBe(true);
  expect(probe.hit).toBe(false);
  await page.mouse.move(probe.x, probe.y); await page.mouse.up();
  await expect(card(page)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pause expedition' })).toHaveCount(0); // auto-open paused the game
  await expect(card(page)).not.toHaveAttribute('data-guard', /.*/);
  await close(page).click();
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

test('three tried controls are not enough for the auto-open: a landing leaves the game running', async ({ browser }) => {
  const t = await labPage(browser, 'standard', { viewport: DESK, init: seedDesktopThree }), { page } = t;
  await mock(page, [200]);
  await lift(page);
  await land(page);
  await expect.poll(async () => (await tel(page)).flying, { timeout: 30000 }).toBe(false);
  await page.waitForTimeout(800);
  await expect(card(page)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Pause expedition' })).toBeVisible();
  expect(t.errors).toEqual([]); await t.context.close();
});

test('opening the pause card yourself never auto-opens the vote; 3 tried controls and 3 minutes lead the pause card with the ask, 2 do not', async ({ browser }) => {
  const t = await labPage(browser, 'standard', { viewport: DESK, init: seedDesktopThree }), { page } = t;
  await mock(page, [200]);
  await lift(page);
  await page.keyboard.press('Escape');
  await expect(paused(page)).toBeVisible();
  await page.waitForTimeout(1500);
  await expect(card(page)).toHaveCount(0);
  // Eligible without a landing (review 2026-09-25: over water a player may never land): the pause card leads with the ask.
  await expect(page.getByTestId('vote-open')).toHaveAttribute('data-nudge', '');
  expect(t.errors).toEqual([]); await t.context.close();
  // Two tried controls: the button is still there and unlocked, but there is no nudge.
  const u = await labPage(browser, 'standard', { viewport: DESK, init: seedDesktopTwo });
  await mock(u.page, [200]);
  await lift(u.page);
  await u.page.keyboard.press('Escape');
  await expect(paused(u.page)).toBeVisible();
  await expect(u.page.getByTestId('vote-open')).toBeVisible();
  await expect(u.page.getByTestId('vote-open')).not.toHaveAttribute('data-nudge', '');
  expect(u.errors).toEqual([]); await u.context.close();
});

for (const [name, viewport, touch, init] of [['393x852 touch', PHONE_PORTRAIT, true, seedTouchTwo], ['1440x900 desktop', DESK, false, seedDesktopTwo]] as const) {
  test(`the vote card passes axe WCAG AA at ${name}`, async ({ browser }) => {
    const t = await labPage(browser, 'standard', { viewport, touch, init }), { page } = t;
    await mock(page, [200]);
    await openFromPause(page, touch);
    const scan = await new AxeBuilder({ page }).include('[data-testid=vote-layer]').withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(scan.violations).toEqual([]);
    expect(t.errors).toEqual([]); await t.context.close();
  });
}

test('the card is a modal dialog: the keyboard cannot leave it or switch controls behind it, and Not yet restores the page', async ({ browser }) => {
  // Review 2026-09-25: Shift+Tab from the heading reached the header's bar, and an arrow key there switched the scheme.
  const t = await labPage(browser, 'standard', { viewport: DESK, init: seedDesktopTwo }), { page } = t;
  await mock(page, [200]);
  await openFromPause(page);
  const current = () => page.evaluate(() => document.documentElement.dataset.controlId ?? null);
  const before = await current();
  await expect(page.getByRole('dialog', { name: 'Which controls did you like?' })).toBeVisible();
  await expect(page.locator('header')).toHaveAttribute('inert', '');
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Shift+Tab');
    expect(await page.evaluate(() => !!document.activeElement?.closest('[data-testid=vote-card]') || document.activeElement === document.body)).toBe(true);
  }
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Digit3'); // the digit shortcuts do not reach past the card either
  expect(await current()).toBe(before);
  await close(page).click();
  await expect(card(page)).toHaveCount(0);
  await expect(page.locator('header')).not.toHaveAttribute('inert', '');
  await expect(paused(page)).toBeVisible();
  expect(t.errors).toEqual([]); await t.context.close();
});

test('667x375: Send vote stays on screen while the card scrolls (sticky, with a shadow as the scroll cue)', async ({ browser }) => {
  const t = await labPage(browser, 'standard', { viewport: { width: 667, height: 375 }, touch: true, init: seedTouchTwo }), { page } = t;
  await mock(page, [200]);
  await openFromPause(page, true);
  const send = card(page).getByRole('button', { name: 'Send vote' });
  const inView = async () => { const b = (await send.boundingBox())!; return b.y >= 0 && b.y + b.height <= 375; };
  expect(await inView()).toBe(true);
  await page.getByTestId('vote-layer').evaluate(e => { e.scrollTop = e.scrollHeight; });
  expect(await inView()).toBe(true);
  expect(t.errors).toEqual([]); await t.context.close();
});
