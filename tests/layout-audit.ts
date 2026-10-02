import { expect, type Browser, type Page } from '@playwright/test';
// The overlap and target-size checker behind tests/layout-fit.spec.ts: what a player can touch, where it is, whether it fits, and whether
// the strip between the buttons is still the flight surface. System Chrome emulation: it checks the layout, never how a thumb feels on a
// real iPhone (docs/screen-cleanup: the physical checks are Garo's).
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
/** The vote chip is allowed to be wide (a progress label) until the vote pill replaces it; every other control on the surface is 96 px or less. */
const WIDE_OK = ['vote-chip'];

export type Mode = { play?: boolean; sheet?: boolean };
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
    // header cluster is the one other hit (its box stays hit-testable for the trackpad's hover freeze) and it is at most 340 x 44.
    const bad = await page.evaluate(({ wide, desktop }) => {
      const out: string[] = [];
      for (let y = 8; y < innerHeight; y += 16) for (let x = 8; x < innerWidth; x += 16) {
        const el = document.elementFromPoint(x, y);
        if (!el || el.closest('[data-play-surface]')) continue;
        if (desktop && el.closest('header')) continue;
        // A control, or the small box a control sits in (Lift/Land's wrapper, [data-ghost-avoid]).
        const c = el.closest('button, a[href], input, select, summary, label, [role=radio], [data-hold-control], [data-ghost-avoid]');
        if (c) { const r = c.getBoundingClientRect(), id = c.getAttribute('data-testid') ?? ''; if ((r.width <= 96 || wide.includes(id)) && r.height <= 96) continue; }
        out.push(`(${x},${y}) ${el.tagName.toLowerCase()}.${String(el.className).slice(0, 30)}${el.getAttribute('data-testid') ? '#' + el.getAttribute('data-testid') : ''}`);
      }
      return out;
    }, { wide: WIDE_OK, desktop: !v.touch });
    if (bad.length) problems.push(`${bad.length} grid points do not reach the flight surface, first: ${bad.slice(0, 4).join('; ')}`);
    if (!v.touch) {
      const h = await page.locator('header').boundingBox();
      if (h && (h.width > 340 || h.height > 44.5)) problems.push(`desktop header box is ${Math.round(h.width)}x${Math.round(h.height)}, more than 340x44`);
    }
  }
  if (mode.sheet) {
    // 6 The sheet is inside the viewport, and its backdrop covers the screen (nothing reaches the surface while it is open).
    const sb = await page.getByTestId('controls-sheet').boundingBox(), bb = await page.getByTestId('controls-backdrop').boundingBox();
    if (!sb || sb.x < -.5 || sb.y < -.5 || sb.x + sb.width > v.width + .5 || sb.y + sb.height > v.height + .5) problems.push(`sheet outside the viewport: ${JSON.stringify(sb)}`);
    if (!bb || bb.x > .5 || bb.y > .5 || bb.width < v.width - .5 || bb.height < v.height - .5) problems.push(`backdrop does not cover the screen: ${JSON.stringify(bb)}`);
  }
  return problems;
}

/** A page at `v`, before Begin: the landing. `saved` seeds the save once; `begin()` starts play. */
export async function openLanding(browser: Browser, v: View, opts: { saved?: Record<string, unknown>; url?: string; fontSize?: string } = {}) {
  const context = await browser.newContext({ viewport: { width: v.width, height: v.height }, isMobile: v.touch, hasTouch: v.touch });
  const page = await context.newPage(), errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  if (opts.saved) await page.addInitScript(s => {
    if (!sessionStorage.getItem('layout-seeded')) { sessionStorage.setItem('layout-seeded', '1'); localStorage.setItem('halaverga-flight-v1', JSON.stringify(s)); }
  }, opts.saved);
  await page.goto(opts.url ?? '/');
  if (opts.fontSize) await page.evaluate(f => { document.documentElement.style.fontSize = f; }, opts.fontSize);
  const begin = page.getByRole('button', { name: 'Begin expedition' });
  await expect(begin).toBeEnabled({ timeout: 60000 });
  const press = (l: ReturnType<Page['locator']>) => v.touch ? l.tap() : l.click();
  return { context, page, errors, press,
    async begin() { await press(begin); await expect(page.getByRole('button', { name: 'Pause expedition' })).toBeVisible(); await page.waitForTimeout(600); } };
}
