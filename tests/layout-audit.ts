import { expect, type Browser, type Page } from '@playwright/test';
import { mockResults } from './controls-browser';
import { voteProblems } from './layout-vote';
import { settingsFootProblems } from './settings-footer';
// The overlap and target-size checker behind tests/layout-fit.spec.ts: what a player can touch, where it is, whether it fits, and whether
// the strip between the buttons is still the flight surface. System Chrome emulation: it checks the layout, never how a thumb feels on a
// real iPhone (docs/screen-cleanup: the physical checks are Garo's).
/** FEEL: on touch the header box passes touches through, so the 8 px gaps and the strip beside the readout are flight surface. Undoing that change by hand: set this to false (the audit then lets the header block count as a hit on touch too). */
export const TOP_STRIP_FLIES = true;
export type View = { name: string; width: number; height: number; touch: boolean };
export const VIEWS: View[] = [
  { name: '393x852 touch', width: 393, height: 852, touch: true },
  { name: '375x667 touch', width: 375, height: 667, touch: true },
  { name: '852x393 touch', width: 852, height: 393, touch: true },
  { name: '667x375 touch', width: 667, height: 375, touch: true },
  { name: '1440x900 mouse', width: 1440, height: 900, touch: false },
  { name: '1024x700 mouse', width: 1024, height: 700, touch: false },
];
/** The narrow phones the top row must survive (360 and 320 wide). */
export const NARROW: View[] = [
  { name: '360x740 touch', width: 360, height: 740, touch: true },
  { name: '320x568 touch', width: 320, height: 568, touch: true },
];
export type Box = { x: number; y: number; width: number; height: number };
export type Item = Box & { name: string; scrolled: boolean; round: boolean; contains: number[] };

/**
 * Every visible control: buttons, links (not the skip link), inputs, selects, summaries, radios and anything tabbable, with a box, not
 * pointer-events:none, not screen-reader-only. A radio or checkbox input counts as its label's box. A control scrolled out of its panel
 * is left out; one inside a scrolling panel is marked `scrolled` (the panel, not the control, has to fit the screen). A control that something
 * else covers at its centre (the Lift/Land button under the Controls backdrop) cannot be touched, so it is left out too. A square control with a
 * 50 percent radius is `round`: its hit shape is a circle, not its box.
 */
export function interactive(page: Page): Promise<Item[]> {
  return page.evaluate(() => {
    const SEL = 'button, a[href], input, select, summary, [role=radio], [tabindex]:not([tabindex="-1"])';
    const els: HTMLElement[] = [], items: { name: string; x: number; y: number; width: number; height: number; scrolled: boolean; round: boolean }[] = [];
    for (const el of document.querySelectorAll<HTMLElement>(SEL)) {
      if (el.matches('a.skip') || el.closest('.sr-only') || el.closest('[inert]') || el.getAttribute('aria-hidden') === 'true') continue;
      const cs = getComputedStyle(el);
      if (cs.pointerEvents === 'none' || cs.visibility === 'hidden' || cs.display === 'none' || !el.checkVisibility()) continue;
      const box = el instanceof HTMLInputElement && (el.type === 'radio' || el.type === 'checkbox') ? (el.closest('label') ?? el) : el;
      const r = box.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) continue;
      // The nearest scrolling panel: a control mostly outside it is scrolled away, not on screen.
      let scrolled = false, hidden = false, sticky = false;
      for (let p = box.parentElement; p && p !== document.body; p = p.parentElement) {
        const cs2 = getComputedStyle(p), o = cs2.overflowY;
        if (cs2.position === 'sticky') sticky = true; // a sticky footer stays put while the rows under it scroll
        if ((o === 'auto' || o === 'scroll') && p.scrollHeight > p.clientHeight + 1) {
          const pr = p.getBoundingClientRect(), seen = Math.max(0, Math.min(r.bottom, pr.bottom) - Math.max(r.top, pr.top));
          scrolled = !sticky; if (seen < r.height * .5) hidden = true;
          break;
        }
      }
      if (hidden) continue;
      const rad = getComputedStyle(box).borderTopLeftRadius, top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      if (top && !box.contains(top) && !top.contains(box)) continue; // covered: not reachable
      els.push(el);
      items.push({ name: (el.getAttribute('aria-label') || el.textContent || el.getAttribute('data-testid') || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 40),
        x: r.x, y: r.y, width: r.width, height: r.height, scrolled, round: Math.abs(r.width - r.height) < 2 && (rad.endsWith('%') ? parseFloat(rad) >= 50 : parseFloat(rad) >= r.width / 2 - .5) });
    }
    return items.map((it, i) => ({ ...it, contains: els.flatMap((o, j) => j !== i && els[i].contains(o) ? [j] : []) }));
  });
}

const rects = (a: Box, b: Box) => Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > .5 && Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > .5;
/** Boxes, except that a round control is a circle (the twin cluster's buttons are circles in square boxes). */
function overlap(a: Box & { round?: boolean }, b: Box & { round?: boolean }) {
  if (!a.round && !b.round) return rects(a, b);
  const circle = (c: Box) => ({ x: c.x + c.width / 2, y: c.y + c.height / 2, r: Math.min(c.width, c.height) / 2 });
  if (a.round && b.round) { const p = circle(a), q = circle(b); return Math.hypot(p.x - q.x, p.y - q.y) < p.r + q.r - .5; }
  const [c, r] = a.round ? [circle(a), b] : [circle(b), a];
  const nx = Math.max(r.x, Math.min(c.x, r.x + r.width)), ny = Math.max(r.y, Math.min(c.y, r.y + r.height));
  return Math.hypot(c.x - nx, c.y - ny) < c.r - .5;
}
/**
 * `scale`: the text size factor in force (scaleText); a text button grows with it, so the 96 px cap on what may sit on the surface grows too.
 * `vote`: which side of the vote's one rule this state is on. locked (under two ways flown): two dots on Controls, and no Vote pill, sheet button
 * or pause door anywhere. ready (two flown, open ballot): the pill beside Controls, the sheet's button and the pause card's door, and no dots.
 */
export type Mode = { play?: boolean; sheet?: boolean; paused?: boolean; settings?: boolean; scale?: number; vote?: 'locked' | 'ready' };
/** Runs the checks of spec section 10.1 that apply to this state; returns one line per problem (empty: the state is clean). */
export async function audit(page: Page, v: View, mode: Mode = {}): Promise<string[]> {
  const items = await interactive(page), problems: string[] = [], at = (i: Item) => `${i.name} [${Math.round(i.x)},${Math.round(i.y)} ${Math.round(i.width)}x${Math.round(i.height)}]`;
  // 1 No two controls overlap (a control and a control inside it are one control).
  // A row scrolling inside a panel may sit under that panel's sticky footer until it is scrolled: only two of the same kind are compared.
  items.forEach((a, i) => items.forEach((b, j) => { if (j > i && a.scrolled === b.scrolled && !a.contains.includes(j) && !b.contains.includes(i) && overlap(a, b)) problems.push(`overlap: ${at(a)} and ${at(b)}`); }));
  // 2 Every target is at least 44 x 44 CSS px.
  for (const i of items) if (i.width < 43.5 || i.height < 43.5) problems.push(`target under 44 px: ${at(i)}`);
  // 3 Inside the viewport, no horizontal scroll.
  for (const i of items) if (!i.scrolled && (i.x < -.5 || i.y < -.5 || i.x + i.width > v.width + .5 || i.y + i.height > v.height + .5)) problems.push(`outside the viewport: ${at(i)}`);
  const scroll = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth }));
  if (scroll.sw > scroll.iw) problems.push(`horizontal scroll: ${scroll.sw} > ${scroll.iw}`);
  if (mode.play) {
    // 4 The readout is passive and clear of every control.
    const tel = page.getByTestId('flight-telemetry');
    if (await tel.count()) {
      const pe = await tel.evaluate(e => getComputedStyle(e).pointerEvents), tb = (await tel.boundingBox())!;
      if (pe !== 'none') problems.push(`readout takes touches (pointer-events ${pe})`);
      for (const i of items) if (overlap(tb, i)) problems.push(`readout overlaps ${at(i)}`);
      // The readout's own lines are never cut: a line whose text is wider than its box shows an ellipsis ('0...' for the altitude).
      const cut = await tel.evaluate(e => [...e.children].flatMap(c => {
        const el = c as HTMLElement;
        return getComputedStyle(el).display !== 'none' && el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1 ? [`"${(el.textContent ?? '').trim()}" ${el.scrollWidth} > ${el.clientWidth}`] : [];
      }));
      for (const c of cut) problems.push(`readout line is cut off: ${c}`);
    }
    // 5 The flight surface gets the gestures: a 16 px grid, every hit is the surface or a control of 96 x 96 or less. On desktop the
    // header is the one other hit: its box is the whole 44 px row, hit-testable for the trackpad's hover freeze (the old header was, and a cursor on the way to Pause
    // must not steer), which is asserted below. On touch there is no such exception.
    const bad = await page.evaluate(({ desktop, cap, scale, header }) => {
      const out: string[] = [];
      for (let y = 8; y < innerHeight; y += 16) for (let x = 8; x < innerWidth; x += 16) {
        const el = document.elementFromPoint(x, y);
        if (!el || el.closest('[data-play-surface]')) continue;
        if (header && el.closest('header')) continue;
        // A control, or the small box a control sits in (Lift/Land's wrapper, [data-ghost-avoid]).
        const c = el.closest('button, a[href], input, select, summary, label, [role=radio], [data-hold-control], [data-ghost-avoid]');
        // The top row's buttons are 44 px high, and so is the hint slot's Read button (the record line); Controls is 108 wide at normal text (the word, the gap and the dots' slot) and grows with the word, 46 px for a doubling:
        // a row, not a pad. The Vote pill and Pause are narrower still.
        if (c) { const r = c.getBoundingClientRect(); if ((r.width <= cap && r.height <= cap) || (c.closest('header') && r.width <= 109 + 46 * (scale - 1) && r.height <= 45) || (c.closest('[data-testid=hint-slot]') && r.width <= 260 * scale && r.height <= 45 * scale)) continue; }
        out.push(`(${x},${y}) ${el.tagName.toLowerCase()}.${String(el.className).slice(0, 30)}${el.getAttribute('data-testid') ? '#' + el.getAttribute('data-testid') : ''}`);
      }
      return out;
    }, { desktop: !v.touch, header: !v.touch || !TOP_STRIP_FLIES, cap: 96 * (mode.scale ?? 1), scale: mode.scale ?? 1 });
    if (bad.length) problems.push(`${bad.length} grid points do not reach the flight surface, first: ${bad.slice(0, 4).join('; ')}`);
    if (!v.touch) {
      const h = await page.locator('header').boundingBox(), gx = Math.max(16, v.width * .045);
      if (h && (h.height > 44.5 || Math.abs(h.width - (v.width - 2 * gx)) > 1.5 || Math.abs(h.x - gx) > 1.5)) problems.push(`desktop header box is ${Math.round(h.width)}x${Math.round(h.height)} at ${Math.round(h.x)}, the whole 44 px row (${Math.round(v.width - 2 * gx)} wide at ${Math.round(gx)}) expected`);
    }
  }
  // 8 The vote's one rule (layout-vote.ts).
  if (mode.vote) problems.push(...await voteProblems(page, mode));
  // 7 Flight settings (the dialog over the paused game): its Resume footer ends at the dialog's bottom edge, at the top and at the end of the scroll.
  if (mode.settings) for (const end of [false, true]) for (const p of await settingsFootProblems(page, end)) problems.push(`settings footer, ${end ? 'end' : 'top'} of the scroll: ${p}`);
  if (mode.sheet) {
    // 6 The sheet is inside the viewport, and its backdrop covers the screen (nothing reaches the surface while it is open).
    const sb = await page.getByTestId('controls-sheet').boundingBox(), bb = await page.getByTestId('controls-backdrop').boundingBox();
    if (!sb || sb.x < -.5 || sb.y < -.5 || sb.x + sb.width > v.width + .5 || sb.y + sb.height > v.height + .5) problems.push(`sheet outside the viewport: ${JSON.stringify(sb)}`);
    if (!bb || bb.x > .5 || bb.y > .5 || bb.width < v.width - .5 || bb.height < v.height - .5) problems.push(`backdrop does not cover the screen: ${JSON.stringify(bb)}`);
    if (sb) {
      // The sheet's two forms (unit 3). A phone (600 px and narrower, or a short landscape window): a bottom sheet, centred, 8 px above the
      // bottom edge (no safe area here), at most 420 wide (680 in two columns on a short landscape window). Otherwise a one-column popover
      // under the row (68 px down: the row's 16 + 44 + 8), 420 wide at most, its right edge on the row's right edge.
      const short = v.height <= 550 && v.width > v.height, bottom = v.width <= 600 || short;
      const cols = new Set(await page.locator('[data-testid=controls-sheet] [data-control]').evaluateAll(els => els.map(e => Math.round(e.getBoundingClientRect().x))));
      if (bottom) {
        if (Math.abs(sb.y + sb.height - (v.height - 8)) > 1) problems.push(`bottom sheet is not 8 px above the bottom edge: ${JSON.stringify(sb)}`);
        if (Math.abs(sb.x + sb.width / 2 - v.width / 2) > 1) problems.push(`bottom sheet is not centred: ${JSON.stringify(sb)}`);
        if (sb.width > (short ? 680.5 : 420.5) || sb.width > v.width - 32 + .5) problems.push(`bottom sheet is too wide: ${Math.round(sb.width)}`);
        if (sb.y < 60 - .5) problems.push(`bottom sheet reaches up into the top row: ${JSON.stringify(sb)}`);
        if ((cols.size > 1) !== short) problems.push(`list columns: ${cols.size} (${short ? 'a short landscape window lists two' : 'one column expected'})`);
      } else {
        if (Math.abs(sb.y - 68) > 1) problems.push(`popover does not start under the row (y 68): ${JSON.stringify(sb)}`);
        if (Math.abs(sb.x + sb.width - (v.width - Math.max(16, v.width * .045))) > 1) problems.push(`popover's right edge is not the row's: ${JSON.stringify(sb)}`);
        if (sb.width > 420.5) problems.push(`popover is wider than 420: ${Math.round(sb.width)}`);
        if (cols.size !== 1) problems.push(`popover lists ${cols.size} columns, one expected`);
        // It never covers the crosshair at the centre of a desktop window (the crosshair exists only while playing).
        if (!mode.paused && sb.x <= v.width / 2 && v.width / 2 <= sb.x + sb.width && sb.y <= v.height / 2 && v.height / 2 <= sb.y + sb.height) problems.push(`popover covers the centre crosshair: ${JSON.stringify(sb)}`);
      }
      // The touch sheet ends with a way to Flight settings; the desktop one has the number-keys checkbox instead.
      const link = await page.getByTestId('controls-settings').count();
      if (link !== (v.touch ? 1 : 0)) problems.push(`Flight settings link count ${link} on ${v.touch ? 'touch' : 'desktop'}`);
    }
  }
  return problems;
}

/**
 * Emulates a 200 percent text size (an Android font scale or a text-only zoom): every element gets twice its own computed font size as an
 * inline px value, read for all elements first so nothing compounds. Setting the root font size scales nothing here, because the page's text
 * is in px. Returns three probes' font sizes before and after, so a test can check that the text really grew before it audits.
 */
export async function scaleText(page: Page, factor: number): Promise<{ before: number[]; after: number[] }> {
  return page.evaluate(f => {
    const probes = ['[data-testid=controls-trigger]', '[data-testid=flight-telemetry] > span:last-child', '[data-testid=flight-telemetry] small'];
    const sizes = () => probes.map(q => { const e = document.querySelector(q); return e ? parseFloat(getComputedStyle(e).fontSize) : NaN; });
    const before = sizes(), els = [...document.querySelectorAll<HTMLElement>('body *')], px = els.map(e => parseFloat(getComputedStyle(e).fontSize));
    els.forEach((e, i) => e.style.setProperty('font-size', `${px[i] * f}px`, 'important'));
    return { before, after: sizes() };
  }, factor);
}

/** A page at `v`, before Begin: the landing. `saved` seeds the save once; `begin()` starts play. */
export async function openLanding(browser: Browser, v: View, opts: { saved?: Record<string, unknown>; storage?: Record<string, string>; url?: string; results?: unknown } = {}) {
  const context = await browser.newContext({ viewport: { width: v.width, height: v.height }, isMobile: v.touch, hasTouch: v.touch });
  const page = await context.newPage(), errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  // `saved` is the game save, `storage` any other localStorage entries (a sent vote, say); both are written once per tab.
  const seed = { ...opts.storage, ...(opts.saved ? { 'halaverga-flight-v1': JSON.stringify(opts.saved) } : {}) };
  if (Object.keys(seed).length) await page.addInitScript(s => {
    if (!sessionStorage.getItem('layout-seeded')) { sessionStorage.setItem('layout-seeded', '1'); for (const [k, x] of Object.entries(s)) localStorage.setItem(k, x); }
  }, seed);
  await mockResults(page, opts.results); // before the page loads: the Vote button asks the ballot once, as soon as two ways are flown
  await page.goto(opts.url ?? '/');
  const begin = page.getByRole('button', { name: 'Begin expedition' });
  await expect(begin).toBeEnabled({ timeout: 60000 });
  const press = (l: ReturnType<Page['locator']>) => v.touch ? l.tap() : l.click();
  return { context, page, errors, press,
    async begin() { await press(begin); await expect(page.getByRole('button', { name: 'Pause expedition' })).toBeVisible(); await page.waitForTimeout(600); } };
}
