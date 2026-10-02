import { expect, test, type Page } from '@playwright/test';
import type { ControlId } from '../src/game/controlTypes';
import { openSheet, row, sheet } from './controls-browser';
import { box, card, chip, inside, LANDSCAPE, mock, ONE_DESK, openFromChip, overlaps, paused, pickAndSend, playing, PORTRAIT, radio, sendBtn, shown, tap,
  trigger, TWO_DESK, TWO_TOUCH, voteMark, votePage } from './vote-browser';
// The header Vote chip, the need-more card and the ballot (spec 1.3 to 1.6), system Chrome emulation, /api/vote and /api/results always
// mocked. Run against a production build on an own port: PLAYTEST_URL=http://127.0.0.1:3421 pnpm test:browser -g "@vote". Sending, the doors
// and the axe/CSP/layout gates are vote-send, vote-doors and vote-gates. Emulation is not iPhone or trackpad validation.
const HEADING = 'Which way of flying felt best?';
const seconds = async (p: Page) => Number(/(\d+) s$/.exec(await shown(p))?.[1] ?? -1);

test('@vote the chip is there from Begin: 0/2 with the seconds, an outline, and a name that adds what to do', async ({ browser }) => {
  const t = await votePage(browser, {}), { page } = t, c = chip(page);
  await mock(page, [200]);
  await expect(c).toBeVisible();
  await expect.poll(() => shown(page)).toMatch(/^Vote 0\/2 · \d+ s$/);
  await expect(c).toHaveAccessibleName(/^Vote 0\/2 · \d+ s ?\. Fly two ways for 20 seconds first\.$/); // CODE-4: the visible seconds are in the name; Chrome may put a space before the tail
  await expect(c).not.toHaveAttribute('data-ready', /.*/);
  expect(await c.getAttribute('aria-label')).toBeNull(); // WCAG 2.5.3: the visible text is inside the name
  const b = await box(c);
  expect(b.height).toBeGreaterThanOrEqual(44); expect(b.width).toBeGreaterThanOrEqual(44);
  expect(await c.evaluate(e => getComputedStyle(e).backgroundColor)).not.toBe('rgb(212, 241, 151)'); // not lime yet
  expect(t.errors).toEqual([]); await t.context.close();
});

test('@vote 1/2 counts down while a key is held, and reaches the lime 2/2 by itself', async ({ browser }) => {
  const t = await votePage(browser, { 'desktop:draw': 25, 'desktop:cursor': 15 }), { page } = t, c = chip(page);
  await mock(page, [200]);
  await expect.poll(() => shown(page)).toMatch(/^Vote 1\/2 · \d+ s$/);
  await expect(c).toHaveAccessibleName(/^Vote 1\/2 · \d+ s ?\. Fly one more way for 20 seconds first\.$/);
  await page.waitForTimeout(2600); // Begin's own press is outside the 2 s input window by now
  const first = await seconds(page);
  expect(first).toBeLessThanOrEqual(5); expect(first).toBeGreaterThan(0);
  await page.keyboard.down('ArrowRight');
  await expect(c).toHaveAttribute('data-ready', '', { timeout: 15000 }); // the seconds ran out while the key was held
  await page.keyboard.up('ArrowRight');
  await expect.poll(() => shown(page)).toMatch(/^Vote(: which felt best\?)?$/);
  await expect(c).toHaveAccessibleName(/^Vote ?: which felt best\?$/);
  expect(t.errors).toEqual([]); await t.context.close();
});

test('@vote two tried: the chip is lime and says Vote: which felt best?, and after the vote it is gone', async ({ browser }) => {
  const t = await votePage(browser, TWO_DESK), { page } = t, c = chip(page);
  await mock(page, [200]);
  await expect(c).toHaveAttribute('data-ready', '');
  await expect.poll(() => shown(page)).toBe('Vote: which felt best?');
  expect(await c.evaluate(e => getComputedStyle(e).backgroundColor)).toBe('rgb(212, 241, 151)');
  await openFromChip(page);
  await pickAndSend(page, 'Cursor');
  await expect(card(page).getByRole('status')).toHaveText('Thanks. Your vote is in.');
  await card(page).getByRole('button', { name: 'Done' }).click();
  await expect(card(page)).toHaveCount(0);
  await expect(c).toHaveCount(0);
  await expect(trigger(page)).toBeVisible();
  expect(t.errors).toEqual([]); await t.context.close();
});

for (const [name, viewport] of [['portrait 393x852', PORTRAIT], ['landscape 852x393', LANDSCAPE]] as const) {
  test(`@vote ${name}: the chip stays on screen left of the trigger, and the trigger does not move when the chip goes away`, async ({ browser }) => {
    const t = await votePage(browser, TWO_TOUCH, { touch: true, viewport }), { page } = t;
    await mock(page, [200]);
    await expect(chip(page)).toBeVisible();
    const before = await box(trigger(page)), c = await box(chip(page));
    expect(inside(c, viewport), 'chip inside the viewport').toBe(true);
    expect(overlaps(c, before), 'chip clear of the trigger').toBe(false);
    await expect(chip(page)).toHaveAccessibleName(/^Vote ?: which felt best\?$/); // the tail is visually clipped up to 520 px, not removed
    if (viewport.width <= 520) expect(c.width, 'narrow: the short label').toBeLessThan(100);
    expect(c.x + c.width).toBeLessThanOrEqual(before.x + 1); // DOM and screen order are Vote, Controls, Pause: it sits to the left of Controls
    expect(c.height).toBeGreaterThanOrEqual(44); expect(c.width).toBeGreaterThanOrEqual(44);
    await openFromChip(page, true);
    await pickAndSend(page, 'One finger', true);
    await expect(card(page).getByRole('status')).toHaveText('Thanks. Your vote is in.');
    await tap(card(page).getByRole('button', { name: 'Done' }), true);
    await expect(chip(page)).toHaveCount(0);
    const after = await box(trigger(page));
    expect(after).toEqual(before); // identical box, chip or no chip
    expect(t.errors).toEqual([]); await t.context.close();
  });
}
const PHONES = [['portrait 320x568', { width: 320, height: 568 }], ['portrait 375x667', { width: 375, height: 667 }], ['portrait 393x852', PORTRAIT], ['portrait 430x932', { width: 430, height: 932 }],
  ['landscape 852x393', LANDSCAPE]] as const;
for (const [name, viewport] of PHONES) {
  test(`@vote ${name}: the widest progress chip fits beside the trigger of every touch control`, async ({ browser }) => {
    const t = await votePage(browser, {}, { touch: true, viewport }), { page } = t;
    await mock(page, [200]);
    for (const [id, label] of [['twin-stick', 'Twin stick'], ['draw', 'Draw'], ['conduct', 'Conduct'], ['brush', 'Brush'], ['one-finger', 'One finger']]) {
      await openSheet(page, true);
      await tap(row(page, id as ControlId), true); // a touch pick closes the sheet
      await expect(sheet(page)).toHaveCount(0);
      await expect(trigger(page)).toHaveAccessibleName(`Controls: ${label}`);
      await expect.poll(() => shown(page)).toMatch(/^Vote 0\/2 · \d+ s$/);
      const b = await box(trigger(page)), c = await box(chip(page));
      expect(inside(c, viewport), `${label}: chip inside the viewport`).toBe(true);
      expect(overlaps(c, b), `${label}: chip clear of the trigger`).toBe(false);
      const text = await box(chip(page).locator('> span').first());
      expect(text.x >= c.x - .5 && text.x + text.width <= c.x + c.width + .5, `${label}: the words fit inside the chip`).toBe(true);
    }
    expect(t.errors).toEqual([]); await t.context.close();
  });
}

test('@vote the chip at 1/2 opens the need-more card; Try closes it with no Skip mark, switches control, and the chip counts on', async ({ browser }) => {
  const t = await votePage(browser, ONE_DESK), { page } = t;
  await mock(page, [200]);
  await expect.poll(() => shown(page)).toMatch(/^Vote 1\/2/);
  await openFromChip(page);
  await expect(card(page)).toHaveAttribute('data-phase', 'need');
  await expect(card(page).getByTestId('vote-need-more')).toHaveText('Fly one more way for 20 seconds, then vote. You have flown 1 of 2 so far.');
  await expect(card(page).getByRole('radio')).toHaveCount(0); await expect(sendBtn(page)).toHaveCount(0);
  const tryBtn = card(page).getByTestId('vote-try'), text = await tryBtn.innerText();
  const label = /^Try (.+) for 20 seconds$/.exec(text)![1];
  expect(['Cursor', 'Flow', 'Captured', 'Mouse + keys']).not.toContain(label); // never the current one, never a pointer-capturing or trackpad-only control
  await tryBtn.click();
  await expect(card(page)).toHaveCount(0);
  await expect(trigger(page)).toHaveAccessibleName(`Controls: ${label}`);
  await expect(playing(page)).toBeVisible(); // the game resumed
  await expect(paused(page)).toHaveCount(0);
  await expect.poll(() => shown(page)).toMatch(/^Vote 1\/2 · \d+ s$/); // the new control still needs its 20 s
  expect(await voteMark(page)).toBeNull(); // no Skip mark, no vote mark
  expect(t.errors).toEqual([]); await t.context.close();
});

test('@vote the need-more card at 0/2: Keep playing leaves no mark, and Escape closes it too', async ({ browser }) => {
  const t = await votePage(browser, {}), { page } = t;
  await mock(page, [200]);
  await openFromChip(page);
  await expect(card(page).getByTestId('vote-need-more')).toHaveText('Fly two ways for 20 seconds each, then vote. You have flown 0 of 2 so far.'); // V6
  await card(page).getByRole('button', { name: 'Keep playing' }).click();
  await expect(card(page)).toHaveCount(0); await expect(playing(page)).toBeVisible();
  await chip(page).click();
  await expect(card(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(card(page)).toHaveCount(0);
  expect(await voteMark(page)).toBeNull();
  expect(t.errors).toEqual([]); await t.context.close();
});

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
