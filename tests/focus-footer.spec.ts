import { expect, test, type Browser, type Page } from '@playwright/test';
import { labPage, openSettings } from './lab-browser';
import { controlId, sheet, trigger } from './controls-browser';
// WCAG 2.2 2.4.11 (focus not obscured): a control focused by the keyboard is never wholly (here: not at all) behind the sticky footer of Flight settings
// (the lime Resume) or of the Controls sheet (Done, Vote, the tried line). Real key presses on touch-emulated phones: Tab through the whole dialog, and the
// arrow keys down the sheet's list, where the list is long enough to scroll (320 x 568, 568 x 320). axe cannot see this; it takes a focus walk.
// System Chrome emulation, not a screen reader or an iPhone with a hardware keyboard.
const PHONES = [{ width: 320, height: 568 }, { width: 375, height: 667 }, { width: 393, height: 852 }, { width: 852, height: 393 }, { width: 568, height: 320 }] as const;
const phone = (browser: Browser, viewport: { width: number; height: number }) => labPage(browser, 'standard', { touch: true, viewport, saved: { flowIntroSeen: true } });

type Stop = { name: string; top: number; bottom: number; footTop: number; inFoot: boolean; inside: boolean; h: number };
/** Where the focused element is, against the footer named by `foot` (a selector); `inside` is whether it is in the dialog or sheet that holds the footer (Tab off its last control lands on the page). */
const where = (page: Page, foot: string): Promise<Stop> => page.evaluate(sel => {
  const e = document.activeElement as HTMLElement, f = document.querySelector(sel)!, r = e.getBoundingClientRect();
  return { name: (e.getAttribute('aria-label') || e.getAttribute('data-testid') || e.textContent || e.tagName).trim().replace(/\s+/g, ' ').slice(0, 40),
    top: r.top, bottom: r.bottom, footTop: f.getBoundingClientRect().top, inFoot: f.contains(e), inside: !!e.closest('dialog, [data-testid=controls-sheet]'), h: innerHeight };
}, foot);
const hidden = (s: Stop) => !s.inFoot && s.bottom > s.footTop + .5 ? `${s.name} reaches ${Math.round(s.bottom - s.footTop)} px under the footer (focus ${Math.round(s.top)} to ${Math.round(s.bottom)}, footer from ${Math.round(s.footTop)})` : s.top < -.5 || s.bottom > s.h + .5 ? `${s.name} is outside the screen` : null;

for (const viewport of PHONES) {
  const at = `${viewport.width}x${viewport.height}`;
  test(`${at}: Tab through Flight settings, forwards and back, never leaves a focused control under the Resume footer`, async ({ browser }) => {
    test.setTimeout(120000);
    const t = await phone(browser, viewport), { page } = t;
    await page.getByRole('button', { name: 'Pause expedition' }).tap();
    await openSettings(page, true);
    const foot = '[data-testid=settings-foot]', problems: string[] = [], seen = new Set<string>([(await where(page, foot)).name]);
    for (let i = 0; i < 90; i++) {
      await page.keyboard.press('Tab');
      const s = await where(page, foot);
      if (!s.inside) break; // off the last control: the walk of the dialog is done
      const p = hidden(s); if (p) problems.push(`Tab ${i + 1}: ${p}`);
      seen.add(s.name);
    }
    expect(seen.size, 'the walk reached the controls of the dialog').toBeGreaterThan(12);
    expect(seen.has('Resume flight'), 'and its Resume footer').toBe(true);
    await page.getByRole('dialog').getByRole('button', { name: 'Resume flight' }).focus(); // and backwards from Resume, up through the list
    for (let i = 0; i < 60; i++) {
      await page.keyboard.press('Shift+Tab');
      const s = await where(page, foot);
      if (!s.inside) break;
      const p = hidden(s); if (p) problems.push(`Shift+Tab ${i + 1}: ${p}`);
      if (s.name === 'Close dialog') break;
    }
    expect(problems, problems.join('\n')).toEqual([]);
    expect(t.errors).toEqual([]); await t.context.close();
  });

  test(`${at}: the arrow keys and Tab through the Controls sheet keep every focused row above its footer`, async ({ browser }) => {
    test.setTimeout(120000);
    const t = await phone(browser, viewport), { page } = t;
    await trigger(page).tap(); await expect(sheet(page)).toBeVisible();
    const foot = '[data-testid=controls-sheet] > div:last-child', problems: string[] = [];
    const inList = async () => { // the focused radio's own box against the visible part of the list (the scroller), not the footer's
      const s = await where(page, foot), r = await page.evaluate(() => { // the list is the scroller marked data-scroll-ok (the sheet itself, before it had its own list)
        const sh = document.querySelector('[data-testid=controls-sheet]')!, l = (sh.querySelector('[data-scroll-ok]') ?? sh).getBoundingClientRect(), e = document.activeElement!.getBoundingClientRect();
        return { top: e.top, bottom: e.bottom, listTop: l.top, listBottom: l.bottom };
      });
      if (r.top < r.listTop - .5 || r.bottom > r.listBottom + .5) problems.push(`${s.name}: focus ${Math.round(r.top)} to ${Math.round(r.bottom)} is outside the list ${Math.round(r.listTop)} to ${Math.round(r.listBottom)}`);
      const p = hidden(s); if (p) problems.push(p);
    };
    await expect(sheet(page).getByRole('radio', { checked: true })).toBeFocused();
    await inList();
    const first = await controlId(page), n = await sheet(page).getByRole('radio').count();
    expect(n).toBe(5);
    for (let i = 0; i < n - 1; i++) { await page.keyboard.press('ArrowDown'); await inList(); }
    for (let i = 0; i < n - 1; i++) { await page.keyboard.press('ArrowUp'); await inList(); }
    expect(await controlId(page), 'the arrows ended where they began').toBe(first);
    let footStops = 0; // the footer's own stops: the Flight settings link, Done (no Vote while it is locked); then focus leaves the sheet for Lift/Land
    for (let i = 0; i < 6; i++) { await page.keyboard.press('Tab'); const s = await where(page, foot); if (!s.inside) break; footStops++; const p = hidden(s); if (p) problems.push(`Tab ${i + 1}: ${p}`); }
    expect(footStops, 'the footer is reachable by Tab').toBeGreaterThanOrEqual(2);
    expect(problems, problems.join('\n')).toEqual([]);
    expect(t.errors).toEqual([]); await t.context.close();
  });
}
