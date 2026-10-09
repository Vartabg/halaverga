import { expect, type Locator, type Page, type Route } from '@playwright/test';
import { labPage, lift, tel } from './lab-browser';
import { voteResults } from './controls-browser';
export { labPage, lift, tel, voteResults };
export { box, inside, overlaps, trigger } from './controls-browser';
// Shared by the vote specs (vote*.spec.ts). Every title in them starts with @vote, so `pnpm test:browser -g "@vote"` runs exactly these
// (the plain word vote also matches controls-every titles). /api/vote and /api/results are always mocked: no test reaches a database.
// System Chrome emulation only: it proves the wiring and the layout, never how the card feels on an iPhone.
export const DESK = { width: 1440, height: 900 }, PORTRAIT = { width: 393, height: 852 }, LANDSCAPE = { width: 852, height: 393 };
export const PLAY_KEY = 'halaverga.vote.play.v2';
export const ONE_DESK = { 'desktop:cursor': 25 };
export const TWO_DESK = { 'desktop:cursor': 25, 'desktop:draw': 25 };
export const TWO_TOUCH = { 'touch:one-finger': 25, 'touch:draw': 25 };
export const card = (p: Page) => p.getByTestId('vote-card');
export const chip = (p: Page) => p.getByTestId('vote-chip');
export const paused = (p: Page) => p.getByRole('region', { name: 'Expedition paused' });
export const playing = (p: Page) => p.getByRole('button', { name: 'Pause expedition' });
export const notYet = (p: Page) => card(p).getByRole('button', { name: 'Not yet' });
export const sendBtn = (p: Page) => card(p).getByRole('button', { name: /^(Send vote|Try again|Sending…)$/ });
export const radio = (p: Page, label: string) => card(p).getByRole('radio', { name: label, exact: true });
export const tap = (l: Locator, touch: boolean) => (touch ? l.tap() : l.click());
/** What the chip shows on screen: its text without the visually hidden spoken tail (toHaveText would include that). */
export const shown = (p: Page) => chip(p).evaluate(e => [...e.childNodes].filter(n => !(n instanceof Element && n.classList.contains('sr-only'))).map(n => n.textContent).join(''));
export const voteMark = (p: Page) => p.evaluate(() => JSON.parse(localStorage.getItem('halaverga.vote.v1') ?? 'null'));

/** An init script: the play record (seconds by 'family:id', round r3) and any other localStorage entries, written once per tab so a reload keeps the page's own changes. */
export function seedInit(secs: Record<string, number>, extra: Record<string, string> = {}): () => void {
  const entries = JSON.stringify({ ...extra, [PLAY_KEY]: JSON.stringify({ round: 'r3', secs }) });
  return new Function(`if (!sessionStorage.getItem('vote-seeded')) { sessionStorage.setItem('vote-seeded', '1');
    for (const [k, v] of Object.entries(${entries})) localStorage.setItem(k, v); }`) as () => void;
}
export async function votePage(browser: Parameters<typeof labPage>[0], secs: Record<string, number>, o: { touch?: boolean; viewport?: { width: number; height: number };
  extra?: Record<string, string> } = {}) {
  const touch = !!o.touch;
  return labPage(browser, 'standard', { touch, viewport: o.viewport ?? (touch ? PORTRAIT : DESK), init: seedInit(secs, o.extra) });
}

export type Reply = number | 'abort';
const ERRORS: Record<number, string> = { 400: 'bad-vote', 403: 'cross-site', 413: 'too-large', 415: 'json-only', 429: 'later', 502: 'store-failed', 503: 'closed' };
/** Mocks both endpoints. /api/vote answers each reply in turn (the last repeats); `results` is a body, or a status number for a failing /api/results. Returns the vote bodies. */
export async function mock(page: Page, replies: Reply[], results: unknown = voteResults()) {
  const bodies: Array<Record<string, unknown>> = [];
  await page.route('**/api/results', r => (typeof results === 'number'
    ? r.fulfill({ status: results, contentType: 'application/json', body: JSON.stringify({ ok: false, error: ERRORS[results] }) })
    : r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(results) })));
  await page.route('**/api/vote', (r: Route) => {
    bodies.push(r.request().postDataJSON());
    const reply = replies[Math.min(bodies.length - 1, replies.length - 1)];
    if (reply === 'abort') return r.abort('failed');
    return r.fulfill({ status: reply, contentType: 'application/json', body: JSON.stringify(reply === 200 ? { ok: true } : { ok: false, error: ERRORS[reply] }) });
  });
  return bodies;
}
/** Taps the header chip and waits for the card, its heading focused. */
export async function openFromChip(page: Page, touch = false) {
  await tap(chip(page), touch);
  await expect(card(page)).toBeVisible();
  await expect(card(page).getByRole('heading', { name: 'Which way of flying felt best?' })).toBeFocused();
}
export async function pickAndSend(page: Page, label = 'Cursor', touch = false) {
  await tap(radio(page, label), touch);
  await tap(sendBtn(page), touch);
}
/** Land from a hover: Land needs a flat surface under the reticle, so drag to look down at the ground first. */
export async function land(page: Page) {
  await page.mouse.move(720, 450); await page.mouse.down(); await page.mouse.move(720, 800, { steps: 15 }); await page.mouse.up();
  await expect.poll(async () => (await tel(page)).pitch).toBeLessThan(-1.1);
  await expect(page.getByText('SURFACE IN REACH · LAND')).toBeVisible();
  await page.getByRole('button', { name: 'Land', exact: true }).click();
}
/** A ranked desktop family for the tally line. */
export const rankedDesktop = () => voteResults({ desktop: { votes: 40, ranked: true, tie: 5, order: ['flow', 'cursor', 'draw', 'brush', 'conduct', 'captured', 'mouse-keys', 'one-finger-keys'], controls: {} } });
