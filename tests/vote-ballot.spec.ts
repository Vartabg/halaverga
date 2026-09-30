import { expect, test } from '@playwright/test';
import { card, chip, mock, notYet, pickAndSend, radio, rankedDesktop, sendBtn, TWO_DESK, TWO_TOUCH, voteMark, votePage, voteResults, openFromChip } from './vote-browser';
// The ballot's order, the touch family and the three-tap path (spec 1.1, 1.4, 1.6, 2.2), system Chrome emulation, /api/vote and /api/results
// always mocked. Run against a production build on an own port: PLAYTEST_URL=http://127.0.0.1:3421 pnpm test:browser -g "@vote".

test('@vote the order is this device\'s own, stable across opens, and the control being flown is never the first row', async ({ browser }) => {
  const t = await votePage(browser, { ...TWO_DESK, 'desktop:brush': 25 }), { page } = t;
  await mock(page, [200]);
  const order = async () => {
    await chip(page).click(); await expect(card(page)).toBeVisible();
    const rows = await card(page).getByTestId('vote-choices').locator('label b').allInnerTexts();
    await notYet(page).click(); await expect(card(page)).toHaveCount(0);
    return rows;
  };
  const seen = new Set<string>();
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
    await page.evaluate(s => localStorage.setItem('halaverga.vote.seed', String(s)), seed);
    const a = await order(), b = await order();
    expect(b, `seed ${seed} is stable`).toEqual(a);
    expect(a.at(-1)).toBe("Can't tell"); expect(a[0], `seed ${seed}: Cursor (current) is not first`).not.toBe('Cursor');
    seen.add(a.join(','));
  }
  expect(seen.size, 'different devices see different orders').toBeGreaterThan(1);
  expect(t.errors).toEqual([]); await t.context.close();
});

test('@vote phone emulation: the touch ballot offers One finger and Draw, sends touch answers, and the tally line is the touch one', async ({ browser }) => {
  const results = { touch: { votes: 40, ranked: true, tie: 2, order: ['brush', 'draw', 'one-finger', 'twin-stick', 'conduct'], controls: {} } };
  const t = await votePage(browser, TWO_TOUCH, { touch: true }), { page } = t, bodies = await mock(page, [200], voteResults(results));
  await openFromChip(page, true);
  await expect(card(page).getByTestId('vote-family')).toHaveText('Touch controls');
  expect((await card(page).getByTestId('vote-choices').locator('label b').allInnerTexts()).sort()).toEqual(["Can't tell", 'Draw', 'One finger']);
  await pickAndSend(page, 'Draw', true);
  await expect(card(page).getByRole('status')).toHaveText('Thanks. Your vote is in.');
  await expect(card(page).getByTestId('vote-tally')).toHaveText('Winning head to head so far on touch: Brush, Draw, One finger.');
  expect(bodies[0]).toMatchObject({ v: 3, device: 'touch', favorite: 'draw', tried: ['one-finger', 'draw'] });
  expect(t.errors).toEqual([]); await t.context.close();
});

test('@vote three taps to a 200: chip, pick, Send; six fields, no text, and the tally line only after Send', async ({ browser }) => {
  const t = await votePage(browser, TWO_DESK), { page } = t, bodies = await mock(page, [200], rankedDesktop());
  await chip(page).click(); // tap 1
  await expect(card(page)).toBeVisible();
  await expect(card(page).getByTestId('vote-tally')).toHaveCount(0); // never before Send
  await radio(page, 'Cursor').click(); // tap 2
  await expect(card(page).getByTestId('vote-tally')).toHaveCount(0);
  await sendBtn(page).click(); // tap 3
  await expect(card(page).getByRole('status')).toHaveText('Thanks. Your vote is in.');
  await expect(card(page).getByTestId('vote-tally')).toHaveText('Winning head to head so far on desktop: Flow, Cursor, Draw.');
  await expect(card(page).getByRole('link', { name: 'See all results' })).toHaveAttribute('href', '/results');
  await expect(card(page).getByRole('button', { name: 'Done' })).toBeFocused();
  expect(bodies).toHaveLength(1);
  expect(Object.keys(bodies[0]).sort()).toEqual(['device', 'favorite', 'last', 'nonce', 'tried', 'v']);
  expect(bodies[0]).toMatchObject({ v: 3, device: 'desktop', favorite: 'cursor', tried: ['cursor', 'draw'], last: 'cursor' });
  expect(bodies[0].nonce).toMatch(/^[0-9a-f]{32}$/);
  const mark = await voteMark(page);
  expect(typeof mark.desktop?.at).toBe('number'); expect(mark.touch).toBeUndefined();
  expect(t.errors).toEqual([]); await t.context.close();
});
