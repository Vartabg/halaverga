import { expect, type Browser, type Locator, type Page } from '@playwright/test';
import type { ControlId } from '../src/game/controlTypes';
import { VOTE_ROUND } from '../src/lib/vote/shape';
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
/** /api/vote and /api/results never reach a real database: both are always mocked. */
export async function mockVote(page: Page) {
  await page.route('**/api/results', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ v: 2, round: VOTE_ROUND, total: 0, notes: 0, stale: 0, builds: {}, families: {} }) }));
  await page.route('**/api/vote', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) }));
}
/** An init script (for labPage's `init`): an earlier play record, seconds per 'family:id', written once per tab before the app reads it. */
export function playInit(secs: Record<string, number>): () => void {
  const value = JSON.stringify(JSON.stringify({ round: VOTE_ROUND, secs }));
  return new Function(`if (!sessionStorage.getItem('controls-play-seeded')) { sessionStorage.setItem('controls-play-seeded', '1'); localStorage.setItem('halaverga.vote.play.v2', ${value}); }`) as () => void;
}
/** An init script: every localStorage access throws, as in some private windows. */
export const blockStorage = () => Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('blocked', 'SecurityError'); } });

export const trigger = (p: Page) => p.getByTestId('controls-trigger');
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
