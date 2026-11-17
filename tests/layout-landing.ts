import type { Page } from '@playwright/test';
import type { View } from './layout-audit';
// Check opening text for collision, clipping and readable sizing across viewports.
const CLEAR = 12, SMALLEST = 11, SENTENCE = 13;
type R = { top: number; bottom: number; left: number; right: number };

export async function landingProblems(page: Page, v: View): Promise<string[]> {
  const read = await page.evaluate(() => {
    const lines = (el: Element): R | null => {
      const rg = document.createRange(); rg.selectNodeContents(el);
      const rs = [...rg.getClientRects()].filter(x => x.width > 1 && x.height > 1);
      if (!rs.length) { const b = el.getBoundingClientRect(); return b.width > 0 ? { top: b.top, bottom: b.bottom, left: b.left, right: b.right } : null; }
      return { top: Math.min(...rs.map(x => x.top)), bottom: Math.max(...rs.map(x => x.bottom)), left: Math.min(...rs.map(x => x.left)), right: Math.max(...rs.map(x => x.right)) };
    };
    const ps = [...document.querySelectorAll('p')], bs = [...document.querySelectorAll('button')];
    const things: Record<string, Element | null | undefined> = {
      title: document.querySelector('h1:not(.sr-only)'), source: document.querySelector('[data-testid=entry-source]'),
      copy: document.querySelector('[data-testid=entry-objective]'),
      begin: bs.find(x => /Ascend Mount Hermon|Loading scene/.test(x.textContent ?? '')),
      hint: document.querySelector('section p[role=status]'), note: document.querySelector('[data-testid=demo-note]'),
      brand: document.querySelector('header [class*=brand]'), guide: bs.find(x => /Field guide/.test(x.textContent ?? '')),
    };
    const rects: Record<string, R> = {};
    for (const [k, el] of Object.entries(things)) if (el && el.getClientRects().length) { const r = lines(el); if (r) rects[k] = r; }
    const sentence = (k: string) => { const p = k === 'note' ? things.note?.querySelector('p') : things[k]; return p ? parseFloat(getComputedStyle(p).fontSize) : null; };
    const small: string[] = [], walker = document.createTreeWalker(document.querySelector('main')!, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const t = (n.textContent ?? '').trim(), el = n.parentElement!;
      if (!t || el.closest('.sr-only') || !el.getClientRects().length) continue;
      const fs = parseFloat(getComputedStyle(el).fontSize); if (fs < 11) small.push(`${fs}px "${t.slice(0, 30)}"`);
    }
    const panel = document.querySelector('section[aria-label="Ascend Mount Hermon"]');
    const clipped = panel ? panel.scrollHeight - panel.clientHeight > 1 : false;
    return { rects, clipped, hint: sentence('hint'), note: sentence('note'), small };
  });
  const problems: string[] = [], R = read.rects, keys = Object.keys(R);
  for (const k of ['title', 'source', 'copy', 'begin', 'hint', 'brand', 'guide']) if (!R[k]) problems.push(`landing: ${k} is not on the screen`);
  keys.forEach((a, i) => keys.slice(i + 1).forEach(b => {
    const x = Math.max(R[a].left, R[b].left) - Math.min(R[a].right, R[b].right), y = Math.max(R[a].top, R[b].top) - Math.min(R[a].bottom, R[b].bottom);
    const clear = Math.max(x, y); // positive: this many px of air on the axis that separates them; negative: they overlap this deep
    if (clear < CLEAR) problems.push(`landing: ${a} and ${b} are ${Math.round(clear * 10) / 10} px apart on ${v.name} (at least ${CLEAR} needed)`);
  }));
  for (const k of keys) if (R[k].left < -.5 || R[k].right > v.width + .5 || R[k].top < -.5 || R[k].bottom > v.height + .5) problems.push(`landing: ${k} is outside the screen`);
  if (read.clipped) problems.push('landing: the briefing clips at default text size');
  for (const s of read.small) problems.push(`landing: text under ${SMALLEST} px: ${s}`);
  if (read.hint !== null && read.hint < SENTENCE) problems.push(`landing: the hint line is ${read.hint} px, ${SENTENCE} at least`);
  if (read.note !== null && read.note < SENTENCE) problems.push(`landing: the demo note is ${read.note} px, ${SENTENCE} at least`);
  return problems;
}
