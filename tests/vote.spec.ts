import { expect, test } from '@playwright/test';
import type { ControlId } from '../src/game/controlTypes';
import { openSheet, row, sheet } from './controls-browser';
import { counted, box, card, chip, dots, inside, LANDSCAPE, lockedName, mock, ONE_DESK, openFromChip, overlaps, paused, pickAndSend, playing, PORTRAIT, QUESTION, radio,
  READY_TEXT, sendBtn, tap, trigger, TWO_DESK, TWO_TOUCH, VOTE_NAME, voteMark, votePage, voteResults } from './vote-browser';
import { said } from './lab-browser';
// The top row's Vote (it exists only when it works), the two dots while it is locked, the ballot (spec 1.3 to 1.6; addendum C1 to C7), system
// Chrome emulation, /api/vote and /api/results always mocked. Run against a production build on an own port:
// PLAYTEST_URL=http://127.0.0.1:3421 pnpm test:browser -g "@vote". Sending, the doors and the axe/CSP/layout gates are vote-send, vote-doors and
// vote-gates. Emulation is not iPhone or trackpad validation.
const HEADING = QUESTION;

test('@vote locked at 0 of 2: no Vote anywhere, two dots on Controls with a text twin, one plain line in the sheet and on the pause card, and no request', async ({ browser }) => {
  const t = await votePage(browser, {}), { page } = t;
  await expect(trigger(page)).toHaveAccessibleName(lockedName('Cursor')); // C1: the dots' twin ends the name
  expect((await trigger(page).innerText()).trim()).toBe('Controls'); // the visible text is only the word, so the name starts with it (WCAG 2.5.3)
  await expect(dots(page)).toHaveCount(2); await expect(counted(page)).toHaveCount(0);
  await expect(page.getByTestId('vote-dots')).toHaveAttribute('aria-hidden', 'true');
  await expect(chip(page)).toHaveCount(0);
  const dot = await dots(page).first().evaluate(e => { const r = e.getBoundingClientRect(), s = getComputedStyle(e); return { w: r.width, h: r.height, bg: s.backgroundColor }; });
  expect(dot.w).toBe(8); expect(dot.h).toBe(8); expect(dot.bg).not.toBe('rgb(94, 230, 208)'); // never the accent: the accent is for what can be pressed
  await openSheet(page);
  await expect(page.getByTestId('controls-tried')).toHaveText('Tried 0 of 2 needed to vote');
  await expect(sheet(page).getByTestId('controls-vote')).toHaveCount(0);
  await expect(sheet(page).getByTestId('controls-done')).toBeVisible();
  await sheet(page).getByTestId('controls-done').click();
  await playing(page).click();
  await expect(paused(page)).toBeVisible();
  await expect(paused(page).getByTestId('vote-open')).toHaveCount(0);
  await expect(paused(page).getByText(QUESTION)).toHaveCount(0);
  await expect(paused(page).getByTestId('controls-tried')).toHaveText('Tried 0 of 2 needed to vote');
  expect(t.asked(), 'the ballot is not asked before two ways are flown').toBe(0);
  expect(t.errors).toEqual([]); await t.context.close();
});

test('@vote locked at 1 of 2: one dot is filled and the name says 1 of 2', async ({ browser }) => {
  const t = await votePage(browser, ONE_DESK), { page } = t;
  await expect(counted(page)).toHaveCount(1); await expect(dots(page)).toHaveCount(2);
  await expect(trigger(page)).toHaveAccessibleName(lockedName('Cursor', 1));
  await expect(chip(page)).toHaveCount(0);
  const [on, off] = await Promise.all([dots(page).nth(0).evaluate(e => getComputedStyle(e).backgroundColor), dots(page).nth(1).evaluate(e => getComputedStyle(e).backgroundColor)]);
  expect(on, 'a counted dot is filled, an empty one is not').not.toBe(off);
  expect(t.errors).toEqual([]); await t.context.close();
});

test('@vote the flip: the Vote pill appears when the second way reaches 20 s, the dots go, Controls does not move, the toast says so once, and DOM order is Vote, Controls, Pause', async ({ browser }) => {
  const t = await votePage(browser, { 'desktop:draw': 25, 'desktop:cursor': 15 }), { page } = t;
  await expect(counted(page)).toHaveCount(1);
  await expect(chip(page)).toHaveCount(0);
  const before = await box(trigger(page));
  await page.waitForTimeout(2600); // Begin's own press is outside the 2 s input window by now
  await page.keyboard.down('ArrowRight');
  await expect(chip(page)).toBeVisible({ timeout: 20000 }); // the seconds ran out while the key was held
  await page.keyboard.up('ArrowRight');
  await expect(dots(page)).toHaveCount(0); // the slot is still there, empty
  await expect(trigger(page)).toHaveAccessibleName('Controls: Cursor');
  expect(await box(trigger(page)), 'C6: Controls keeps its box when the pill appears').toEqual(before);
  const c = await box(chip(page));
  expect(c.x + c.width).toBeLessThan(before.x); expect(c.height).toBeGreaterThanOrEqual(44); expect(c.width).toBeGreaterThanOrEqual(44);
  expect((await chip(page).innerText()).trim()).toBe('Vote'); await expect(chip(page)).toHaveAccessibleName(VOTE_NAME);
  expect(await chip(page).evaluate(e => getComputedStyle(e).backgroundColor)).toBe('rgb(94, 230, 208)');
  await expect.poll(() => said(page)).toContain(READY_TEXT); // C4: the toast carries the vote card's question
  await expect(page.locator('p', { hasText: READY_TEXT })).toBeVisible();
  await expect(page.locator('p', { hasText: READY_TEXT })).toHaveCount(0, { timeout: 8000 }); // a 4 s message
  const order = await page.locator('main header button').evaluateAll(bs => bs.map(b => b.getAttribute('data-testid') ?? b.getAttribute('aria-label')));
  expect(order, 'C7: Vote, Controls, Pause').toEqual(['vote-chip', 'controls-trigger', 'Pause expedition']);
  expect(t.errors).toEqual([]); await t.context.close();
});

test('@vote arriving with two ways already flown shows the pill with no Vote is ready toast, and asks the ballot once', async ({ browser }) => {
  const t = await votePage(browser, TWO_DESK), { page } = t;
  await expect(chip(page)).toBeVisible();
  await page.waitForTimeout(1500);
  expect(await said(page)).not.toContain(READY_TEXT); // only a flip the player watched is announced
  expect(t.asked()).toBe(1);
  expect(t.errors).toEqual([]); await t.context.close();
});

test('@vote two tried: the pill is lime and says Vote, its name carries the question, and after the vote it is gone and Controls has no dots', async ({ browser }) => {
  const t = await votePage(browser, TWO_DESK), { page } = t, c = chip(page);
  await mock(page, [200]);
  await expect(c).toBeVisible();
  expect((await c.innerText()).trim()).toBe('Vote'); await expect(c).toHaveAccessibleName(VOTE_NAME); // WCAG 2.5.3: the name starts with the visible word
  expect(await c.evaluate(e => getComputedStyle(e).backgroundColor)).toBe('rgb(94, 230, 208)');
  await expect(dots(page)).toHaveCount(0); await expect(trigger(page)).toHaveAccessibleName('Controls: Cursor'); // dots and the pill never appear together
  await openFromChip(page);
  await pickAndSend(page, 'Cursor');
  await expect(card(page).getByRole('status')).toHaveText('Thanks. Your vote is in.');
  await card(page).getByRole('button', { name: 'Done' }).click();
  await expect(card(page)).toHaveCount(0);
  await expect(c).toHaveCount(0);
  await expect(trigger(page)).toBeVisible(); await expect(dots(page)).toHaveCount(0);
  expect(t.errors).toEqual([]); await t.context.close();
});

for (const results of [503, voteResults({}, false)] as const) {
  test(`@vote C5 a closed ballot (${typeof results === 'number' ? 'a 503' : 'open:false'}) shows no pill, no dots, no sheet button and no pause door`, async ({ browser }) => {
    const t = await votePage(browser, TWO_DESK, { results }), { page } = t;
    await expect.poll(t.asked).toBe(1); // asked once, as soon as two ways are flown
    await page.waitForTimeout(700); // and answered
    await expect(chip(page)).toHaveCount(0); await expect(dots(page)).toHaveCount(0);
    await expect(trigger(page)).toHaveAccessibleName('Controls: Cursor');
    await openSheet(page);
    await expect(sheet(page).getByTestId('controls-vote')).toHaveCount(0);
    await expect(page.getByTestId('controls-tried')).toHaveText('Tried 2 of 8');
    await sheet(page).getByTestId('controls-done').click();
    await playing(page).click();
    await expect(paused(page)).toBeVisible();
    await expect(paused(page).getByTestId('vote-open')).toHaveCount(0);
    expect(t.errors).toEqual([]); await t.context.close();
  });
}

for (const [name, results] of [['a 500', 500], ['no connection', 'abort'], ['an unreadable answer', { v: 1 }]] as const) {
  test(`@vote C5 an offline ballot (${name}) keeps the pill, and the card says voting may be paused when it is tapped`, async ({ browser }) => {
    const t = await votePage(browser, TWO_DESK, { results }), { page } = t;
    await expect(chip(page)).toBeVisible();
    await openFromChip(page);
    await expect(card(page).getByTestId('vote-paused')).toHaveText('Voting may be paused. You can still try to send.');
    await expect(card(page)).toHaveAttribute('data-phase', 'ballot');
    expect(t.errors).toEqual([]); await t.context.close();
  });
}

for (const [name, viewport] of [['portrait 393x852', PORTRAIT], ['landscape 852x393', LANDSCAPE]] as const) {
  test(`@vote ${name}: the pill stays on screen left of Controls, and Controls does not move when the pill goes away`, async ({ browser }) => {
    const t = await votePage(browser, TWO_TOUCH, { touch: true, viewport }), { page } = t;
    await mock(page, [200]);
    await expect(chip(page)).toBeVisible();
    const before = await box(trigger(page)), c = await box(chip(page));
    expect(inside(c, viewport), 'pill inside the viewport').toBe(true);
    expect(overlaps(c, before), 'pill clear of Controls').toBe(false);
    await expect(chip(page)).toHaveAccessibleName(VOTE_NAME);
    expect(c.x + c.width).toBeLessThanOrEqual(before.x + 1); // DOM and screen order are Vote, Controls, Pause: it sits to the left of Controls
    expect(c.height).toBeGreaterThanOrEqual(44); expect(c.width).toBeGreaterThanOrEqual(44);
    await openFromChip(page, true);
    await pickAndSend(page, 'One finger', true);
    await expect(card(page).getByRole('status')).toHaveText('Thanks. Your vote is in.');
    await tap(card(page).getByRole('button', { name: 'Done' }), true);
    await expect(chip(page)).toHaveCount(0);
    expect(await box(trigger(page))).toEqual(before); // identical box, pill or no pill
    expect(t.errors).toEqual([]); await t.context.close();
  });
}
const PHONES = [['portrait 320x568', { width: 320, height: 568 }], ['portrait 375x667', { width: 375, height: 667 }], ['portrait 393x852', PORTRAIT], ['portrait 430x932', { width: 430, height: 932 }],
  ['landscape 852x393', LANDSCAPE]] as const;
const TOUCH_CONTROLS = [['twin-stick', 'Twin stick'], ['draw', 'Draw'], ['conduct', 'Conduct'], ['brush', 'Brush'], ['one-finger', 'One finger']] as const;
for (const [name, viewport] of PHONES) {
  test(`@vote ${name}: Controls is one width for every touch control, with the dots or with the pill beside it, and all of it fits`, async ({ browser }) => {
    const t = await votePage(browser, {}, { touch: true, viewport }), { page } = t;
    const widths = new Set<number>();
    for (const [id, label] of TOUCH_CONTROLS) {
      await openSheet(page, true);
      await tap(row(page, id as ControlId), true); // a touch pick closes the sheet
      await expect(sheet(page)).toHaveCount(0);
      await expect(trigger(page)).toHaveAccessibleName(lockedName(label));
      const b = await box(trigger(page)), pause = await box(page.getByRole('button', { name: 'Pause expedition' }));
      expect(inside(b, viewport), `${label}: Controls inside the viewport`).toBe(true);
      expect(overlaps(b, pause), `${label}: Controls clear of Pause`).toBe(false);
      widths.add(Math.round(b.width * 10));
      await expect(dots(page)).toHaveCount(2);
    }
    expect(widths.size, 'the same width for every control with the dots showing').toBe(1);
    await t.context.close();
    const r = await votePage(browser, TWO_TOUCH, { touch: true, viewport });
    await expect(chip(r.page)).toBeVisible();
    for (const [id, label] of TOUCH_CONTROLS) {
      await openSheet(r.page, true);
      await tap(row(r.page, id as ControlId), true);
      await expect(sheet(r.page)).toHaveCount(0);
      await expect(trigger(r.page)).toHaveAccessibleName(`Controls: ${label}`);
      const b = await box(trigger(r.page)), c = await box(chip(r.page)), pause = await box(r.page.getByRole('button', { name: 'Pause expedition' }));
      expect(inside(c, viewport), `${label}: pill inside the viewport`).toBe(true);
      expect(overlaps(c, b) || overlaps(b, pause) || overlaps(c, pause), `${label}: pill, Controls and Pause clear of each other`).toBe(false);
      widths.add(Math.round(b.width * 10));
    }
    expect(widths.size, 'the same width with the pill as with the dots').toBe(1);
    expect(t.errors.concat(r.errors)).toEqual([]); await r.context.close();
  });
}

test('@vote the ballot lists only the ways flown, Can\'t tell last, nothing selected; an empty Send asks for a pick and focuses the first radio', async ({ browser }) => {
  const t = await votePage(browser, { ...TWO_DESK, 'desktop:flow': 5, 'touch:brush': 90 }), { page } = t;
  await mock(page, [200]);
  await openFromChip(page);
  await expect(card(page)).toHaveAttribute('data-phase', 'ballot');
  await expect(card(page).getByTestId('vote-family')).toHaveText('Desktop controls');
  const labels = await card(page).getByTestId('vote-choices').locator('label b').allInnerTexts();
  expect(labels.slice().sort()).toEqual(["Can't tell", 'Cursor', 'Draw']); // Flow (5 s) and the touch controls are not offered
  expect(labels.at(-1)).toBe("Can't tell");
  await expect(card(page).getByRole('radio', { checked: true })).toHaveCount(0);
  await expect(card(page).getByRole('radiogroup', { name: HEADING })).toBeVisible();
  await expect(sendBtn(page)).toHaveAttribute('aria-disabled', 'true');
  expect(await sendBtn(page).getAttribute('disabled')).toBeNull(); // never disabled: focus must not drop
  await sendBtn(page).click({ force: true });
  await expect(card(page).getByRole('status')).toHaveText('Pick one way first.');
  await expect(card(page).getByRole('radio').first()).toBeFocused();
  expect(await voteMark(page)).toBeNull();
  await radio(page, 'Draw').check();
  await expect(sendBtn(page)).toHaveAttribute('aria-disabled', 'false');
  await expect(card(page).getByRole('status')).toHaveText('');
  expect(t.errors).toEqual([]); await t.context.close();
});

test('@vote arrow keys move and select the radios and never send; Enter on a radio sends nothing', async ({ browser }) => {
  const t = await votePage(browser, TWO_DESK), { page } = t, bodies = await mock(page, [200]);
  await openFromChip(page);
  await page.keyboard.press('Tab');
  await expect(card(page).getByRole('radio').first()).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(card(page).getByRole('radio', { checked: true })).toHaveCount(1);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  expect(bodies).toHaveLength(0);
  await expect(card(page)).toBeVisible();
  expect(t.errors).toEqual([]); await t.context.close();
});
