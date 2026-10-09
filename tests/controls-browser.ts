import { expect, type Browser, type Locator, type Page } from '@playwright/test';
import type { ControlId } from '../src/game/controlTypes';
import { VOTE_ROUND } from '../src/lib/vote/ballot';
import { labPage, type Lab } from './lab-browser';
export { labPage, lift, shots, tel } from './lab-browser';
// Shared helpers for the controls picker specs (controls-picker.spec.ts). They wrap lab-browser's labPage for any registry id and
// read the trigger, the sheet, its rows and the saved store. System Chrome emulation only: never how a control feels on a phone.
export const PHONE_LANDSCAPE = { width: 852, height: 393 } as const;
export const PHONE_PORTRAIT = { width: 393, height: 852 } as const;
export const DESKTOP = { width: 1440, height: 900 } as const;
export const SIZES = [{ ...PHONE_PORTRAIT, touch: true }, { ...PHONE_LANDSCAPE, touch: true }, { ...DESKTOP, touch: false }] as const;
export const DESKTOP_IDS: ControlId[] = ['cursor', 'one-finger-keys', 'flow', 'captured', 'mouse-keys', 'draw', 'conduct', 'brush'];
export const TOUCH_IDS: ControlId[] = ['one-finger', 'twin-stick', 'draw', 'conduct', 'brush'];
const LABS: string[] = ['draw', 'conduct', 'brush'];
type LabOpts = NonNullable<Parameters<typeof labPage>[2]>;
type Opts = Omit<LabOpts, 'saved'> & { saved?: Record<string, unknown> | null };

/**
 * A page after Begin with `id` chosen by ?controls= (a session override). Flow's welcome is pre-dismissed through the seeded save;
 * `saved: null` seeds nothing (for the blocked-storage rows, where any localStorage access throws).
 */
export async function controlsPage(browser: Browser, id: ControlId | 'standard', opts: Opts = {}) {
  const lab = (LABS.includes(id) ? id : 'standard') as Lab;
  const url = opts.url ?? (id === 'standard' ? '/' : `/?controls=${id}`);
  const { saved, ...rest } = opts;
  return labPage(browser, lab, { ...rest, url, ...(saved === null ? {} : { saved: { flowIntroSeen: true, ...saved } }) });
}
/** A v3 /api/results body: every family unranked (no per-control numbers), or the given ones (shape: src/lib/vote/ballot.ts). */
export const voteResults = (families: Record<string, unknown> = {}, open = true) => {
  const empty = { votes: 0, ranked: false, tie: null, order: null, controls: null };
  return { v: 3, round: VOTE_ROUND, asOf: '2026-09-30T14:05:12Z', open, families: { touch: empty, desktop: empty, ...families } };
};
/** Answers /api/results (never a real database): a body, a failing status, or 'abort' (no connection). Install it BEFORE the page loads (labPage's `routes`) when the page
 *  must see it: the Vote button asks the ballot once, as soon as two ways are flown, and a request that beats the route reaches the real server. */
export async function mockResults(page: Page, results: unknown = voteResults()) {
  await page.route('**/api/results', r => (results === 'abort' ? r.abort('failed') : typeof results === 'number'
    ? r.fulfill({ status: results, contentType: 'application/json', body: JSON.stringify({ ok: false, error: results === 503 ? 'closed' : 'store-failed' }) })
    : r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(results) })));
}
/** /api/vote and /api/results never reach a real database: both are always mocked. Returns the vote bodies the page sent. */
export async function mockVote(page: Page, results: unknown = voteResults()) {
  const bodies: Array<Record<string, unknown>> = [];
  await mockResults(page, results);
  await page.route('**/api/vote', r => { bodies.push(r.request().postDataJSON()); return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) }); });
  return bodies;
}
/** An init script (for labPage's `init`): an earlier play record, seconds per 'family:id', written once per tab before the app reads it. */
export function playInit(secs: Record<string, number>): () => void {
  const value = JSON.stringify(JSON.stringify({ round: VOTE_ROUND, secs }));
  return new Function(`if (!sessionStorage.getItem('controls-play-seeded')) { sessionStorage.setItem('controls-play-seeded', '1'); localStorage.setItem('halaverga.vote.play.v2', ${value}); }`) as () => void;
}
/** An init script: every localStorage access throws, as in some private windows. */
export const blockStorage = () => Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('blocked', 'SecurityError'); } });

export const trigger = (p: Page) => p.getByTestId('controls-trigger');
/** The top Controls button's accessible name for a control: `Controls: <label>`, and while the vote is locked (fewer than two ways flown, the
 *  default state of a fresh page) the text twin of its two dots after it. The pause card's and Flight settings' rows never carry the twin. */
export const controlName = (label: string) => new RegExp(`^Controls: ${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(: vote unlocks after two ways, [0-2] of 2 tried)?$`);
export const sheet = (p: Page) => p.getByTestId('controls-sheet');
export const row = (p: Page, id: ControlId) => sheet(p).locator(`[data-control="${id}"]`);
export const rows = (p: Page) => sheet(p).locator('[data-control]');
export const rowIds = (p: Page) => rows(p).evaluateAll(els => els.map(e => e.getAttribute('data-control')));
export const paused = (p: Page) => p.getByRole('region', { name: 'Expedition paused' });
export const controlId = (p: Page) => p.evaluate(() => document.documentElement.dataset.controlId ?? null);
export const saved = (p: Page) => p.evaluate(() => JSON.parse(localStorage.getItem('halaverga-flight-v1') ?? '{}') as Record<string, unknown>);
/** Opens the sheet with a click (or tap) on the trigger and waits for it. */
export async function openSheet(page: Page, touch = false) {
  if (touch) await trigger(page).tap(); else await trigger(page).click();
  await expect(sheet(page)).toBeVisible();
}
export async function box(l: Locator) {
  const b = await l.boundingBox();
  if (!b) throw new Error('element has no box');
  return b;
}
type Box = { x: number; y: number; width: number; height: number };
export const overlaps = (a: Box, b: Box) => a.x < b.x + b.width - .5 && b.x < a.x + a.width - .5 && a.y < b.y + b.height - .5 && b.y < a.y + a.height - .5;
export const inside = (b: Box, v: { width: number; height: number }) => b.x >= -.5 && b.y >= -.5 && b.x + b.width <= v.width + .5 && b.y + b.height <= v.height + .5;
