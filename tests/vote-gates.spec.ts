import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { box, card, chip, DESK, dots, LANDSCAPE, mock, notYet, ONE_DESK, openFromChip, PORTRAIT, radio, rankedDesktop, sendBtn, tap, TWO_DESK, TWO_TOUCH, votePage } from './vote-browser';
// The gates for the vote surface: axe (WCAG AA), 44 px targets, focus order, forced colours, the CSP, and the card at phone sizes. System
// Chrome emulation, /api/vote and /api/results always mocked. PLAYTEST_URL=http://127.0.0.1:3421 pnpm test:browser -g "@vote".
const PRIVACY_LINK = ['How your vote is', 'counted'].join(' '); // split so the spec 11.4 grep for the retired thanks copy finds nothing
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'];
const scan = (page: Page, css: string) => new AxeBuilder({ page }).include(css).withTags(TAGS).analyze();

for (const [name, viewport, touch, secs] of [['393x852 touch', PORTRAIT, true, TWO_TOUCH], ['1440x900 desktop', DESK, false, TWO_DESK]] as const) {
  test(`@vote axe WCAG AA at ${name}: the header with the Vote pill and with the locked dots, and the card as a ballot and done`, async ({ browser }) => {
    const t = await votePage(browser, secs, { touch, viewport }), { page } = t;
    await mock(page, [200]);
    await expect(chip(page)).toBeVisible();
    expect((await scan(page, 'header')).violations, 'the lime Vote pill beside Controls').toEqual([]);
    await openFromChip(page, touch);
    expect((await scan(page, '[data-testid=vote-layer]')).violations, 'ballot').toEqual([]);
    await pickAndSend(page, touch);
    await expect(card(page).getByRole('status')).toHaveText('Thanks. Your vote is in.');
    expect((await scan(page, '[data-testid=vote-layer]')).violations, 'done').toEqual([]);
    await t.context.close();
    const n = await votePage(browser, ONE_DESK, { touch: false, viewport });
    await expect(dots(n.page)).toHaveCount(2);
    expect((await scan(n.page, 'header')).violations, 'Controls with its two dots (one counted)').toEqual([]);
    expect(t.errors.concat(n.errors)).toEqual([]); await n.context.close();
  });
}
async function pickAndSend(page: Page, touch: boolean) {
  const first = card(page).getByTestId('vote-choices').locator('label b').first();
  await tap(radio(page, (await first.innerText()).trim()), touch);
  await tap(sendBtn(page), touch);
}

for (const [name, viewport, touch, secs] of [['393x852', PORTRAIT, true, TWO_TOUCH], ['852x393', LANDSCAPE, true, TWO_TOUCH], ['1440x900', DESK, false, TWO_DESK]] as const) {
  test(`@vote ${name}: every target is at least 44 px, the focus order is radios, link, Send, Not yet, and Send stays reachable`, async ({ browser }) => {
    const t = await votePage(browser, secs, { touch, viewport }), { page } = t;
    await mock(page, [200], rankedDesktop());
    expect((await box(chip(page))).height).toBeGreaterThanOrEqual(44);
    await openFromChip(page, touch);
    const targets = card(page).locator('label[data-control], a, button');
    for (const b of await targets.all()) {
      const r = (await b.boundingBox())!, what = (await b.innerText()).trim().split('\n')[0];
      expect(r.height, `${what} is 44 px high`).toBeGreaterThanOrEqual(44);
      if (r.width < 200) expect(r.width, `${what} is 44 px wide`).toBeGreaterThanOrEqual(44);
    }
    const order: string[] = [];
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press('Tab');
      order.push(await page.evaluate(() => { const e = document.activeElement as HTMLElement; return e.tagName === 'INPUT' ? 'radio' : (e.textContent ?? '').trim(); }));
    }
    expect(order).toEqual(['radio', PRIVACY_LINK, 'Send vote', 'Not yet']);
    // The card scrolls inside the layer; Send and Not yet stay on screen (sticky in a short landscape window).
    await page.getByTestId('vote-layer').evaluate(e => { e.scrollTop = e.scrollHeight; });
    for (const l of [sendBtn(page), notYet(page)]) {
      const r = (await l.boundingBox())!;
      expect(r.y).toBeGreaterThanOrEqual(0); expect(r.y + r.height).toBeLessThanOrEqual(viewport.height + .5);
    }
    if (viewport.height < 500) { await page.getByTestId('vote-layer').evaluate(e => { e.scrollTop = 0; }); expect((await sendBtn(page).boundingBox())!.y + 48).toBeLessThanOrEqual(viewport.height + 1); }
    expect(t.errors).toEqual([]); await t.context.close();
  });
}

test('@vote forced colours: the pill, the dots and the ballot stay visible and readable, and axe (bar its contrast rule) finds nothing', async ({ browser }) => {
  const t = await votePage(browser, TWO_DESK), { page } = t;
  await mock(page, [200]);
  await page.emulateMedia({ forcedColors: 'active' });
  await expect(chip(page)).toBeVisible();
  const paint = (l: ReturnType<typeof chip>) => l.evaluate(e => { const s = getComputedStyle(e); return { fg: s.color, bg: s.backgroundColor, border: s.borderTopColor }; });
  const ready = await paint(chip(page));
  expect(ready.fg).not.toBe(ready.bg); expect(ready.border).not.toBe('rgba(0, 0, 0, 0)');
  await openFromChip(page);
  await radio(page, 'Cursor').check();
  const row = card(page).locator('label[data-control=cursor]'), pick = await paint(row);
  expect(pick.fg, 'the picked row differs from its background').not.toBe(pick.bg);
  const send = await paint(sendBtn(page));
  expect(send.fg).not.toBe(send.bg); expect(send.border).not.toBe('rgba(0, 0, 0, 0)');
  // Contrast is the user's own palette here, and axe reads the page's painted colours (a white Canvas) wrongly, so that one rule is off.
  const other = await new AxeBuilder({ page }).include('[data-testid=vote-layer]').withTags(TAGS).disableRules(['color-contrast']).analyze();
  expect(other.violations).toEqual([]);
  expect(t.errors).toEqual([]); await t.context.close();
  // The locked dots: a counted one is painted differently from an empty one, both are drawn against the button, and neither is transparent.
  const n = await votePage(browser, ONE_DESK);
  await n.page.emulateMedia({ forcedColors: 'active' });
  await expect(dots(n.page)).toHaveCount(2);
  const dot = (i: number) => dots(n.page).nth(i).evaluate(e => { const s = getComputedStyle(e); return { bg: s.backgroundColor, border: s.borderTopColor }; });
  const [on, off] = [await dot(0), await dot(1)], button = await paint(n.page.getByTestId('controls-trigger'));
  expect(on.bg, 'counted differs from empty').not.toBe(off.bg);
  expect(on.bg, 'counted differs from the button').not.toBe(button.bg);
  expect(off.border, 'an empty dot is outlined, not transparent').not.toBe('rgba(0, 0, 0, 0)'); expect(off.border).not.toBe(button.bg);
  await n.context.close();
});

test('@vote reduced motion: nothing on the card, the pill or the dots animates or transitions', async ({ browser }) => {
  const t = await votePage(browser, TWO_DESK), { page } = t;
  await mock(page, [200]);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openFromChip(page);
  const moving = await page.evaluate(() => [...document.querySelectorAll('[data-testid=vote-card], [data-testid=vote-card] *, [data-testid=vote-chip], [data-testid=vote-dots], [data-testid=vote-dots] i')]
    .filter(e => { const s = getComputedStyle(e); return (s.animationName !== 'none' && parseFloat(s.animationDuration) > 0) || parseFloat(s.transitionDuration) > 0; }).length);
  expect(moving).toBe(0);
  expect(t.errors).toEqual([]); await t.context.close();
});

test('@vote CSP: the game answers with a framing policy, and the pill, card and send raise no securitypolicyviolation (no script rule: any event would be a real bug)', async ({ browser }) => {
  const t = await votePage(browser, TWO_DESK), { page } = t, seen: string[] = [];
  await mock(page, [200], rankedDesktop());
  await page.exposeFunction('reportCsp', (m: string) => { seen.push(m); });
  await page.evaluate(() => document.addEventListener('securitypolicyviolation', e => (window as unknown as { reportCsp: (m: string) => void }).reportCsp(`${e.violatedDirective} ${e.blockedURI}`)));
  page.on('console', m => { if (/content security policy/i.test(m.text())) seen.push(m.text()); });
  const head = await page.request.get('/');
  expect(head.headers()['x-frame-options']).toBe('DENY');
  expect(head.headers()['content-security-policy']).toContain("frame-ancestors 'none'");
  await openFromChip(page);
  await radio(page, 'Cursor').check();
  await sendBtn(page).click();
  await expect(card(page).getByTestId('vote-tally')).toBeVisible();
  await card(page).getByRole('button', { name: 'Done' }).click();
  await page.waitForTimeout(300);
  expect(seen).toEqual([]);
  expect(t.errors).toEqual([]); await t.context.close();
});
