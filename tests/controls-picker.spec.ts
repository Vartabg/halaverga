import AxeBuilder from '@axe-core/playwright';
import { controlName } from './controls-browser';
import { expect, test, type Page } from '@playwright/test';
import { DESKTOP, DESKTOP_IDS, PHONE_LANDSCAPE, PHONE_PORTRAIT, SIZES, TOUCH_IDS, blockStorage, box, controlId, controlsPage, inside, lift, mockResults, mockVote,
  openSheet, overlaps, paused, playInit, row, rowIds, saved, shots, sheet, tel, trigger } from './controls-browser';
// The controls picker: header trigger, sheet, digit keys, the demo note (spec sections 3 and 4). System Chrome emulation (touch
// emulation for the phone rows): it checks wiring, layout and semantics, never how any control feels on a real iPhone or Mac
// trackpad, and env(safe-area-inset-*) is 0 here, so "inside the safe areas" is only the viewport check. /api/vote and /api/results
// are always mocked. Run against a production build on port 3391 only: PLAYTEST_URL=http://127.0.0.1:3391.
const heading = async (p: Page) => (await tel(p)).heading;
const turned = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(b - a), Math.cos(b - a)));
const LABELS = ['Cursor', 'One finger + keys', 'Flow', 'Captured', 'Mouse + keys', 'Draw', 'Conduct', 'Brush'];
const hint = (p: Page) => p.locator('[class*="trackpadHint"]');

// What each desktop id mounts and saves: the settings patch of the registry, the layer that answers to it.
type Layer = (p: Page) => Promise<void>;
const none = (p: Page) => expect(p.locator('[class*="trackpadHint"], [data-testid=simple-trackpad-hud], [data-testid=flow-hud]')).toHaveCount(0);
const LAYERS: Record<string, { save: Record<string, unknown>; layer: Layer }> = {
  cursor: { save: { controlLab: 'standard', desktopMode: 'trackpad', trackpadSteering: 'free' }, layer: async p => { await expect(p.getByTestId('flight-surface')).toHaveAttribute('data-scheme', 'classic'); await expect(hint(p)).toContainText('SPACE TO FLY'); } },
  'one-finger-keys': { save: { controlLab: 'standard', desktopMode: 'trackpad', trackpadSteering: 'simple' }, layer: p => expect(p.getByTestId('simple-trackpad-hud').or(p.getByTestId('controls-hint')).first()).toBeVisible() }, // the hud steps aside while the blaster's controls hint teaches (SimpleTrackpadHud)
  flow: { save: { controlLab: 'standard', desktopMode: 'trackpad', trackpadSteering: 'flow' }, layer: p => expect(p.getByTestId('flow-hud')).toHaveCount(1) },
  captured: { save: { controlLab: 'standard', desktopMode: 'trackpad', trackpadSteering: 'captured' }, layer: p => expect(hint(p)).toContainText('CLICK TO FLY') },
  'mouse-keys': { save: { controlLab: 'standard', desktopMode: 'mouse' }, layer: none },
  draw: { save: { controlLab: 'draw' }, layer: p => expect(p.getByTestId('lab-surface')).toHaveCount(1) },
  conduct: { save: { controlLab: 'conduct' }, layer: p => expect(p.getByTestId('lab-surface')).toHaveCount(1) },
  brush: { save: { controlLab: 'brush' }, layer: p => expect(p.getByTestId('lab-surface')).toHaveCount(1) },
};

test('desktop keys 1-8 each mount the right layer, are saved, and never pause', async ({ browser }) => {
  const t = await controlsPage(browser, 'standard', { viewport: DESKTOP }), { page } = t;
  await expect(trigger(page)).toHaveAccessibleName(controlName('Cursor'));
  // 2..8 then 1: pressing the current control's digit is a no-op, so each press below is a real switch.
  for (const n of [2, 3, 4, 5, 6, 7, 8, 1]) {
    const id = DESKTOP_IDS[n - 1], want = LAYERS[id];
    await page.keyboard.press(`Digit${n}`);
    await expect.poll(() => controlId(page)).toBe(id);
    await expect(trigger(page)).toHaveAccessibleName(controlName(LABELS[n - 1]));
    await want.layer(page);
    if (['draw', 'conduct', 'brush'].includes(id)) expect(await page.evaluate(() => document.documentElement.dataset.controls)).toBe(id);
    else await expect(page.getByTestId('lab-surface')).toHaveCount(0);
    const store = await saved(page);
    for (const [k, v] of Object.entries(want.save)) expect(store[k], `${id}: ${k}`).toBe(v);
    await expect(page.getByRole('button', { name: 'Pause expedition' })).toBeVisible();
    await expect(paused(page)).toHaveCount(0);
  }
  await page.keyboard.press('Numpad3');
  await expect.poll(() => controlId(page)).toBe('flow');
  await page.keyboard.press('Digit9'); await page.keyboard.press('Digit0');
  expect(await controlId(page)).toBe('flow');
  expect(t.errors).toEqual([]); await t.context.close();
});

test('with the number-keys checkbox off the digits do nothing; inside the focused list they still work', async ({ browser }) => {
  const t = await controlsPage(browser, 'standard', { viewport: DESKTOP }), { page } = t;
  await openSheet(page);
  const keys = sheet(page).getByRole('checkbox', { name: 'Number keys 1-8 switch controls' });
  await expect(keys).toBeChecked();
  await keys.uncheck();
  expect(await page.evaluate(() => localStorage.getItem('halaverga.controls.keys.v1'))).toBe('off');
  await page.keyboard.press('Escape'); await expect(sheet(page)).toHaveCount(0);
  await page.keyboard.press('Digit3'); await page.waitForTimeout(300);
  expect(await controlId(page)).toBe('cursor');
  // Focus is in the list when the sheet opens, so the digit is a focused-widget shortcut and works whatever the preference says.
  await openSheet(page);
  await expect(row(page, 'cursor').getByRole('radio')).toBeFocused();
  await page.keyboard.press('Digit3');
  await expect.poll(() => controlId(page)).toBe('flow');
  await expect(row(page, 'flow').getByRole('radio')).toBeFocused();
  await expect(row(page, 'flow').getByRole('radio')).toBeChecked();
  expect(t.errors).toEqual([]); await t.context.close();
});

test('the sheet by mouse and by keyboard fires no shot, does not pause, stops a cruise and steers nothing while the cursor is over it', async ({ browser }) => {
  const t = await controlsPage(browser, 'standard', { viewport: DESKTOP }), { page } = t, surface = page.getByTestId('flight-surface');
  await lift(page);
  // W from hover starts the free cursor's cruise and keeps it after release (desktop-keyboard.spec).
  await page.mouse.move(720, 380);
  await page.keyboard.down('KeyW'); await page.waitForTimeout(300); await page.keyboard.up('KeyW');
  await expect(surface).toHaveAttribute('data-trackpad-active', 'true');
  const fired = await shots(page);
  await openSheet(page);
  await expect(surface).toHaveAttribute('data-trackpad-active', 'false'); // opening drops held input and the cruise
  await expect(paused(page)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Pause expedition' })).toBeVisible();
  expect(await shots(page)).toBe(fired);
  // The cursor over the sheet (a dialog) never turns the view.
  const h0 = await heading(page), r = await box(row(page, 'flow'));
  for (let i = 0; i < 12; i++) await page.mouse.move(r.x + 20 + (i % 6) * 40, r.y + r.height / 2 + (i % 2) * 6);
  await page.waitForTimeout(500);
  expect(turned(h0, await heading(page))).toBeLessThan(.03);
  // Escape closes without pausing; focus goes back to the scene.
  await page.keyboard.press('Escape');
  await expect(sheet(page)).toHaveCount(0);
  await expect(paused(page)).toHaveCount(0);
  await expect(page.locator('main#expedition')).toBeFocused();
  // By keyboard: focus the trigger and press Enter; the checked radio takes focus; Escape closes with focus on the scene.
  await trigger(page).focus(); await page.keyboard.press('Enter');
  await expect(sheet(page)).toBeVisible();
  await expect(row(page, 'cursor').getByRole('radio')).toBeFocused();
  await expect(trigger(page)).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Escape');
  await expect(sheet(page)).toHaveCount(0);
  await expect(paused(page)).toHaveCount(0);
  expect(await shots(page)).toBe(fired);
  // Escape while focus is on the trigger closes the sheet too, and still does not pause.
  await openSheet(page); await trigger(page).focus(); await page.keyboard.press('Escape');
  await expect(sheet(page)).toHaveCount(0); await expect(paused(page)).toHaveCount(0);
  expect(t.errors).toEqual([]); await t.context.close();
});

test('a click outside the sheet closes it without a shot and without pausing; Done closes it; the trigger toggles it', async ({ browser }) => {
  const t = await controlsPage(browser, 'standard', { viewport: DESKTOP }), { page } = t;
  const fired = await shots(page);
  await openSheet(page);
  await page.mouse.click(60, 600);
  await expect(sheet(page)).toHaveCount(0);
  expect(await shots(page)).toBe(fired);
  await expect(paused(page)).toHaveCount(0);
  await openSheet(page); await sheet(page).getByTestId('controls-done').click();
  await expect(sheet(page)).toHaveCount(0);
  await openSheet(page); await trigger(page).click();
  await expect(sheet(page)).toHaveCount(0);
  // A desktop pick keeps the sheet open (it closes on Esc, Done or an outside click).
  await openSheet(page); await row(page, 'draw').click();
  await expect.poll(() => controlId(page)).toBe('draw');
  await expect(sheet(page)).toBeVisible();
  await expect(trigger(page)).toHaveAccessibleName(controlName('Draw'));
  expect(t.errors).toEqual([]); await t.context.close();
});

test('the sheet Vote button (there once two ways are flown) closes the sheet and opens the vote card (mocked)', async ({ browser }) => {
  const t = await controlsPage(browser, 'standard', { viewport: DESKTOP, init: playInit({ 'desktop:cursor': 25, 'desktop:draw': 25 }), routes: p => mockResults(p) }), { page } = t;
  await mockVote(page);
  await openSheet(page);
  await sheet(page).getByTestId('controls-vote').click();
  await expect(page.getByTestId('vote-card')).toBeVisible();
  await expect(sheet(page)).toHaveCount(0);
  expect(t.errors).toEqual([]); await t.context.close();
});

for (const v of [PHONE_LANDSCAPE, PHONE_PORTRAIT]) {
  test(`phone ${v.width}x${v.height}: with two ways flown the sheet footer holds Vote beside Done, both on screen, 44 px tall`, async ({ browser }) => {
    const t = await controlsPage(browser, 'standard', { touch: true, viewport: v, init: playInit({ 'touch:one-finger': 25, 'touch:draw': 25 }), routes: p => mockResults(p) }), { page } = t;
    await expect(page.getByTestId('vote-chip')).toBeVisible();
    await openSheet(page, true);
    const vote = sheet(page).getByTestId('controls-vote'), done = sheet(page).getByTestId('controls-done');
    for (const [what, l] of [['Vote', vote], ['Done', done]] as const) {
      const b = await box(l);
      expect(inside(b, v), what).toBe(true); expect(b.height, what).toBeGreaterThanOrEqual(44);
    }
    expect((await box(vote)).x, 'Vote comes first').toBeLessThan((await box(done)).x);
    const fits = await sheet(page).evaluate(e => e.scrollHeight <= e.clientHeight + 1);
    if (v.height < 500) expect(fits, 'the two-column landscape sheet still fits with the Vote button').toBe(true);
    expect(t.errors).toEqual([]); await t.context.close();
  });
}

test('Tried X of N counts controls with 20 s of seeded play, and marks their rows', async ({ browser }) => {
  const t = await controlsPage(browser, 'standard', { viewport: DESKTOP, init: playInit({ 'desktop:cursor': 30, 'desktop:draw': 20, 'desktop:flow': 19 }) }), { page } = t;
  await openSheet(page);
  await expect(sheet(page).getByTestId('controls-tried')).toHaveText('Tried 2 of 8');
  await expect(sheet(page).locator('[data-badge="tried"]')).toHaveCount(2);
  await expect(row(page, 'cursor').locator('[data-badge="tried"]')).toHaveCount(1);
  await expect(row(page, 'draw').locator('[data-badge="tried"]')).toHaveCount(1);
  await expect(row(page, 'flow').locator('[data-badge="tried"]')).toHaveCount(0);
  await expect(row(page, 'cursor').locator('[data-badge="default"]')).toHaveText('Default');
  await expect(sheet(page).locator('[data-badge="default"]')).toHaveCount(1);
  expect(t.errors).toEqual([]); await t.context.close();
});

test('the desktop sheet lists the eight desktop controls with digits 1-8', async ({ browser }) => {
  const t = await controlsPage(browser, 'standard', { viewport: DESKTOP }), { page } = t;
  await openSheet(page);
  expect(await rowIds(page)).toEqual(DESKTOP_IDS);
  for (const [i, id] of DESKTOP_IDS.entries()) {
    await expect(row(page, id).getByRole('radio')).toHaveAttribute('aria-keyshortcuts', String(i + 1));
    await expect(row(page, id).locator('kbd')).toHaveText(String(i + 1));
  }
  await expect(sheet(page).getByRole('radio')).toHaveCount(8);
  expect(t.errors).toEqual([]); await t.context.close();
});

for (const v of [PHONE_LANDSCAPE, PHONE_PORTRAIT]) {
  test(`phone ${v.width}x${v.height}: five touch controls, sheet inside the screen, footer reachable, 44 px rows, a touch pick closes it and flight works`, async ({ browser }) => {
    const t = await controlsPage(browser, 'twin-stick', { touch: true, viewport: v }), { page, finger } = t;
    await expect(trigger(page)).toHaveAccessibleName(controlName('Twin stick'));
    await openSheet(page, true);
    expect(await rowIds(page)).toEqual(TOUCH_IDS);
    for (const label of ['Cursor', 'Flow', 'Captured', 'Mouse + keys', 'One finger + keys']) await expect(sheet(page).getByText(label, { exact: true })).toHaveCount(0);
    await expect(sheet(page).locator('kbd')).toHaveCount(0);
    await expect(sheet(page).getByRole('checkbox')).toHaveCount(0);
    await expect(sheet(page).getByTestId('controls-tried')).toHaveText('Tried 0 of 2 needed to vote');
    const s = await box(sheet(page));
    expect(inside(s, v), 'sheet inside the viewport').toBe(true);
    expect(s.width).toBeLessThanOrEqual(v.height < 500 ? 680.5 : 420.5); // a short landscape phone gets the two-column sheet
    const head = await box(page.locator('header'));
    expect(s.y, 'sheet under the header').toBeGreaterThanOrEqual(head.y + head.height - 1);
    for (const id of TOUCH_IDS) expect((await box(row(page, id))).height, id).toBeGreaterThanOrEqual(44);
    // A landscape phone lists the five rows in two columns, so they fit at 852 x 393 without scrolling (750 x 340 scrolls by touch:
    // controls-review-fixes.spec.ts). Done stays in view either way (Vote joins it once two ways are flown: the next test).
    const fits = await sheet(page).evaluate(e => e.scrollHeight <= e.clientHeight + 1);
    expect(fits, 'five rows fit the sheet').toBe(true);
    if (v.height < 500) expect((await box(row(page, 'twin-stick'))).x, 'two columns').toBeGreaterThan((await box(row(page, 'one-finger'))).x + 100);
    await expect(sheet(page).getByTestId('controls-vote')).toHaveCount(0); // fewer than two ways flown: the line above, no Vote button
    expect(inside(await box(sheet(page).getByTestId('controls-done')), v), 'Done').toBe(true);
    // A touch pick closes the sheet at once, the store changes, and the one-finger hold flies with no further tap.
    await row(page, 'one-finger').tap();
    await expect(sheet(page)).toHaveCount(0);
    await expect(page.getByTestId('flight-surface')).toHaveAttribute('data-scheme', 'classic');
    expect(await controlId(page)).toBe('one-finger');
    const spot = { x: Math.round(v.width * .25), y: Math.round(v.height * .7) };
    await finger.down(spot);
    await expect.poll(async () => (await tel(page)).flying, { timeout: 5000 }).toBe(true);
    await expect.poll(async () => (await tel(page)).speed, { timeout: 5000 }).toBeGreaterThan(1.5);
    // A tap on the trigger while a finger holds flight opens the sheet and releases the hold (opening drops held input).
    await trigger(page).tap();
    await expect(sheet(page)).toBeVisible();
    await expect.poll(async () => (await tel(page)).speed, { timeout: 8000 }).toBeLessThan(.5);
    await finger.up();
    await expect(page.getByRole('button', { name: 'Pause expedition' })).toBeVisible();
    expect(t.errors).toEqual([]); await t.context.close();
  });
}

test('phone: tapping the current row closes the sheet; the backdrop closes it; rows never list desktop controls', async ({ browser }) => {
  const t = await controlsPage(browser, 'one-finger', { touch: true, viewport: PHONE_PORTRAIT }), { page } = t;
  await openSheet(page, true);
  await row(page, 'one-finger').tap();
  await expect(sheet(page)).toHaveCount(0);
  await openSheet(page, true);
  await page.touchscreen.tap(20, 200); // the backdrop: above the bottom sheet, which starts about y 300 at this size
  await expect(sheet(page)).toHaveCount(0);
  await expect(paused(page)).toHaveCount(0);
  expect(t.errors).toEqual([]); await t.context.close();
});

test('the demo note shows on the first visit only, and never overlaps Begin, the hero title or the header', async ({ browser }) => {
  for (const v of [PHONE_PORTRAIT, PHONE_LANDSCAPE, DESKTOP]) {
    const touch = v.width < 900, context = await browser.newContext({ viewport: v, isMobile: touch, hasTouch: touch }), page = await context.newPage();
    await page.goto('/');
    const begin = page.getByRole('button', { name: 'Begin expedition' }), note = page.getByTestId('demo-note');
    await expect(begin).toBeVisible();
    await expect(trigger(page)).toHaveCount(0); // the trigger is a post-Begin control
    const b = await box(begin);
    expect(inside(b, v), `Begin inside ${v.width}x${v.height}`).toBe(true);
    const others = [page.locator('[class*="heroTitle"]'), page.locator('[class*="brand"]').first(), page.locator('[class*="headerActions"]')];
    for (const o of others) if (await o.count()) expect(overlaps(b, await box(o)), 'Begin over the header or title').toBe(false);
    if (v.height <= 430) {
      await expect(note).toBeHidden(); // short landscape phones hide the note by CSS
    } else {
      await expect(note).toBeVisible();
      await expect(note).toContainText('A demo of new ways to fly. After you begin, try each in the Controls menu, then vote.');
      const n = await box(note);
      expect(inside(n, v), `note inside ${v.width}x${v.height}`).toBe(true);
      expect(overlaps(n, b), 'note over Begin').toBe(false);
      for (const o of others) if (await o.count()) expect(overlaps(n, await box(o)), 'note over the header or title').toBe(false);
      const got = note.getByRole('button', { name: 'Got it' });
      expect((await box(got)).height).toBeGreaterThanOrEqual(44);
      await got.click();
      await expect(note).toHaveCount(0);
      await page.reload();
      await expect(page.getByRole('button', { name: 'Begin expedition' })).toBeVisible();
      await expect(page.getByTestId('demo-note')).toHaveCount(0);
    }
    await context.close();
  }
});

test('the trigger appears after Begin and the top row does not overlap at the three sizes', async ({ browser }) => {
  for (const v of SIZES) {
    const t = await controlsPage(browser, 'standard', { touch: v.touch, viewport: { width: v.width, height: v.height } }), { page } = t;
    await expect(trigger(page)).toBeVisible();
    const b = await box(trigger(page));
    expect(inside(b, v), `trigger inside ${v.width}x${v.height}`).toBe(true);
    expect(b.height).toBeGreaterThanOrEqual(44);
    // One row while playing: the readout on the left, Controls and Pause on the right; the brand stays on the landing (the full checker is layout-fit.spec.ts).
    await expect(page.locator('[class*="brand"]')).toHaveCount(0);
    for (const o of [page.getByTestId('flight-telemetry'), page.getByRole('button', { name: 'Pause expedition' })]) expect(overlaps(b, await box(o)), `row item at ${v.width}x${v.height}`).toBe(false);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(t.errors).toEqual([]); await t.context.close();
  }
});

test('axe finds nothing on the open sheet, on desktop and on a phone', async ({ browser }) => {
  const scan = async (p: Page) => expect((await new AxeBuilder({ page: p }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([]);
  const d = await controlsPage(browser, 'standard', { viewport: DESKTOP });
  await openSheet(d.page); await scan(d.page);
  await d.context.close();
  const p = await controlsPage(browser, 'one-finger', { touch: true, viewport: PHONE_PORTRAIT });
  await openSheet(p.page, true); await scan(p.page);
  await p.context.close();
});

test('glyphs hold still under reduced motion (system preference or the setting) and move otherwise', async ({ browser }) => {
  const anim = (p: Page) => row(p, 'flow').locator('svg path').last().evaluate(e => getComputedStyle(e).animationName);
  const t = await controlsPage(browser, 'standard', { viewport: DESKTOP }), { page } = t;
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await openSheet(page);
  expect(await anim(page)).not.toBe('none');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await anim(page)).toBe('none');
  await t.context.close();
  const s = await controlsPage(browser, 'standard', { viewport: DESKTOP, saved: { reduced: true } });
  await s.page.emulateMedia({ reducedMotion: 'no-preference' });
  await openSheet(s.page);
  expect(await anim(s.page)).toBe('none'); // the in-game setting holds them still too
  await s.context.close();
});

test('blocked localStorage still works: the demo note dismisses for the page and the digits still switch', async ({ browser }) => {
  const context = await browser.newContext({ viewport: DESKTOP }), first = await context.newPage();
  await first.addInitScript(blockStorage);
  await first.goto('/');
  await expect(first.getByTestId('demo-note')).toBeVisible();
  await first.getByTestId('demo-note').getByRole('button', { name: 'Got it' }).click();
  await expect(first.getByTestId('demo-note')).toHaveCount(0);
  await context.close();
  const t = await controlsPage(browser, 'standard', { viewport: DESKTOP, init: blockStorage, saved: null }), { page } = t;
  await expect(trigger(page)).toHaveAccessibleName(controlName('Cursor'));
  await page.keyboard.press('Digit2');
  await expect.poll(() => controlId(page)).toBe('one-finger-keys');
  await openSheet(page);
  await sheet(page).getByRole('checkbox', { name: 'Number keys 1-8 switch controls' }).uncheck();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Digit4'); await page.waitForTimeout(300);
  expect(await controlId(page)).toBe('one-finger-keys'); // the off choice holds for this page even though storage refuses it
  await t.context.close();
});
