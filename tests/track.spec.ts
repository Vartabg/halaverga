import { expect, test, type Page } from '@playwright/test';
import { card, DESK, labPage, mock, openFromChip, pickAndSend, seedInit, TWO_DESK } from './vote-browser';
// Anonymous funnel counts at the vote card (src/lib/track.ts): the ballot and Send each send one bare count through the vendor queue
// (window.va), Do Not Track sends none, and with no queue at all the vote still works. The queue is a spy defined before the page runs
// (read-only, so a Vercel build's boot script cannot replace it); /api/vote and /api/results are mocked. System Chrome emulation.
// PLAYTEST_URL=http://127.0.0.1:3560 pnpm test:browser tests/track.spec.ts
const SPY = `var calls = []; window.__counts = calls;
  Object.defineProperty(window, 'va', { configurable: false, get: () => function () { calls.push(JSON.parse(JSON.stringify([].slice.call(arguments)))); }, set: () => undefined });`;
const DNT = `Object.defineProperty(navigator, 'doNotTrack', { value: '1', configurable: true });`;
const init = (...parts: string[]) => new Function(`(${seedInit(TWO_DESK).toString()})(); ${parts.join('\n')}`) as () => void;
const counts = (p: Page) => p.evaluate(() => (window as unknown as { __counts?: unknown[] }).__counts ?? null);
const open = (browser: Parameters<typeof labPage>[0], ...parts: string[]) => labPage(browser, 'standard', { viewport: DESK, init: init(...parts) });

test('@vote @track the ballot and Send each send one bare count: a name and nothing else', async ({ browser }) => {
  const t = await open(browser, SPY), { page } = t, bodies = await mock(page, [200]);
  expect(await counts(page)).toEqual([]);
  await openFromChip(page);
  await expect(card(page).getByTestId('vote-family')).toBeVisible();
  expect(await counts(page)).toEqual([['event', { name: 'vote_card_shown' }]]);
  await pickAndSend(page);
  await expect(card(page).getByRole('status')).toHaveText('Thanks. Your vote is in.', { timeout: 10000 });
  expect(await counts(page)).toEqual([['event', { name: 'vote_card_shown' }], ['event', { name: 'vote_sent' }]]); // each once; no pick, no code, no data
  expect(bodies).toHaveLength(1);
  expect(JSON.stringify(await counts(page))).not.toMatch(/cursor|draw|nonce/i);
  expect(t.errors).toEqual([]); await t.context.close();
});

test('@vote @track Do Not Track sends no count and the vote still goes through', async ({ browser }) => {
  const t = await open(browser, DNT, SPY), { page } = t, bodies = await mock(page, [200]);
  await openFromChip(page);
  await pickAndSend(page);
  await expect(card(page).getByRole('status')).toHaveText('Thanks. Your vote is in.', { timeout: 10000 });
  expect(await counts(page)).toEqual([]);
  expect(bodies).toHaveLength(1);
  expect(t.errors).toEqual([]); await t.context.close();
});

test('@vote @track with no analytics on the page the card and Send work and nothing throws', async ({ browser }) => {
  const t = await open(browser), { page } = t, bodies = await mock(page, [200]);
  await openFromChip(page);
  await pickAndSend(page);
  await expect(card(page).getByRole('status')).toHaveText('Thanks. Your vote is in.', { timeout: 10000 });
  expect(bodies).toHaveLength(1);
  expect(t.errors).toEqual([]); await t.context.close();
});
