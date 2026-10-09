import { expect, type Page } from '@playwright/test';
import type { Box, View } from './layout-audit';
// The one hint slot as a layout check (spec section 8, addendum D5 and G1), one line per problem: it is a single passive line under the top row,
// centred, inside the screen and clear of every control and of the readout; only the record's Read button takes touches and it is 44 px; the old
// advice elements (the flight toast, the 8 px caption, the terminal chip, the controls hint's own line) are gone from the page. System Chrome
// emulation: the layout, never how a line reads over the real world on an iPhone.

/** The old elements the slot replaced: none of them may exist any more. */
const GONE = ['[class*="flightHint"]', '[class*="touchHint"]', '[class*="discovery"]'];

export const slotBox = async (page: Page): Promise<Box> => (await page.getByTestId('hint-slot').boundingBox())!;

export async function hintProblems(page: Page, v: View, kind: 'coach' | 'record' | 'message'): Promise<string[]> {
  const problems: string[] = [], slot = page.getByTestId('hint-slot');
  if (await slot.count() !== 1) return [`${await slot.count()} hint slots, one expected`];
  const k = await slot.getAttribute('data-kind');
  if (k !== kind) problems.push(`the slot is a ${k} line, a ${kind} line expected`);
  const b = await slotBox(page), header = (await page.locator('header').boundingBox())!, tel = await page.getByTestId('flight-telemetry').boundingBox();
  const row = await page.locator('main').evaluate(m => ({ hdr: parseFloat(getComputedStyle(m).getPropertyValue('--top')) || 16, extra: parseFloat(m.style.getPropertyValue('--row-extra')) || 0 }));
  // Under the row: at --hdr (the row's top, its 44 px, 8 px, and the wrapped pill's room), and centred.
  const want = row.hdr + 44 + 8 + row.extra;
  if (Math.abs(b.y - want) > 1) problems.push(`the slot is at y ${b.y.toFixed(1)}, --hdr is ${want}`);
  if (b.y < header.y + header.height + 7.5) problems.push(`the slot is not 8 px under the row: ${JSON.stringify({ slot: b, header })}`);
  if (Math.abs(b.x + b.width / 2 - v.width / 2) > 1.5) problems.push(`the slot is not centred: ${JSON.stringify(b)}`);
  if (b.x < -.5 || b.x + b.width > v.width + .5) problems.push(`the slot is outside the screen: ${JSON.stringify(b)}`);
  if (b.width > v.width * .88 + .5) problems.push(`the slot is wider than 88 percent of the screen: ${Math.round(b.width)}`);
  // At most two lines of text (the record line is its one 44 px button, 46 with the border).
  const lineH = await slot.evaluate(e => parseFloat(getComputedStyle(e).lineHeight));
  if (kind !== 'record' && b.height > lineH * 2 + 12 + 2) problems.push(`the slot is taller than two lines: ${b.height.toFixed(1)}`);
  if (tel && Math.min(b.x + b.width, tel.x + tel.width) - Math.max(b.x, tel.x) > .5 && Math.min(b.y + b.height, tel.y + tel.height) - Math.max(b.y, tel.y) > .5) problems.push('the slot overlaps the readout');
  // Passive, except the record's Read button: a coach or message line takes no touches, the record line holds exactly one 44 px button.
  const pe = await slot.evaluate(e => getComputedStyle(e).pointerEvents), buttons = slot.getByRole('button');
  if (pe !== 'none') problems.push(`the slot takes touches (pointer-events ${pe})`);
  if (kind === 'record') {
    if (await buttons.count() !== 1) problems.push(`${await buttons.count()} buttons in the record line, one expected`);
    else { const r = (await buttons.boundingBox())!; if (r.height < 43.5 || r.width < 43.5) problems.push(`the Read button is ${r.width.toFixed(1)}x${r.height.toFixed(1)}`); }
    if (b.height < 43.5) problems.push(`the record line is ${b.height.toFixed(1)} px tall`);
  } else if (await buttons.count()) problems.push(`a ${kind} line holds ${await buttons.count()} button(s)`);
  for (const sel of GONE) if (await page.locator(sel).count()) problems.push(`the old ${sel} is still on the page`);
  if (await page.getByText(/ONE THUMB TO FLY|LEFT THUMB MOVES/).count()) problems.push('the 8 px ONE THUMB caption is still on the page');
  // Nothing under it breaks: the surface under the slot still gets a touch (the slot is not the thing hit at its own centre).
  if (kind !== 'record') {
    const hit = await page.evaluate(({ x, y }) => { const el = document.elementFromPoint(x, y); return el ? (el.closest('[data-play-surface]') ? 'surface' : el.tagName.toLowerCase() + '.' + String(el.className).slice(0, 24)) : 'none'; }, { x: b.x + b.width / 2, y: b.y + b.height / 2 });
    if (hit !== 'surface') problems.push(`a touch at the slot's centre reaches ${hit}, not the flight surface`);
  }
  return problems;
}

/** Waits for the slot to show `text` as `kind`, then audits it: the call every state test makes. */
export async function expectSlot(page: Page, v: View, kind: 'coach' | 'record' | 'message', text: string | RegExp) {
  await expect(page.getByTestId('hint-slot')).toHaveAttribute('data-kind', kind, { timeout: 15000 });
  await expect(page.getByTestId('hint-slot')).toHaveText(text);
  const problems = await hintProblems(page, v, kind);
  expect(problems, problems.join('\n')).toEqual([]);
}
