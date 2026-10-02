import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { computeLayout } from '../src/game/touchLayout';
import { VOTE_ROUND } from '../src/lib/vote/ballot';
import { NARROW, VIEWS, audit, openLanding, scaleText, type View } from './layout-audit';
// The screen cleanup's layout checker (spec section 10.1): at six viewports, in each state, no two controls overlap, every target is
// 44 x 44 or more, everything is inside the screen, the readout is passive, and the flight surface still gets the gestures (on touch the
// gaps between the top-row buttons too). The two narrow phones (360, 320) and a 200 percent text size cover the top row's squeeze.
// System Chrome emulation: the layout, never the feel of a thumb on a real iPhone.
const wcag = async (page: import('@playwright/test').Page) =>
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([]);
const AXE_AT = ['393x852 touch', '1440x900 mouse'];

for (const v of [...VIEWS, ...NARROW]) {
  test(`${v.name}: landing, playing, sheet, paused and paused-sheet have no overlap, small target or lost surface`, async ({ browser }) => {
    test.setTimeout(120000);
    const t = await openLanding(browser, v), { page } = t, all: string[] = [];
    const check = async (state: string, mode: Parameters<typeof audit>[2]) => { for (const p of await audit(page, v, mode)) all.push(`${state}: ${p}`); };
    await check('landing', {});
    await t.begin(); await check('playing', { play: true });
    if (AXE_AT.includes(v.name)) await wcag(page);
    await t.press(page.getByTestId('controls-trigger'));
    await expect(page.getByTestId('controls-sheet')).toBeVisible();
    await check('sheet', { sheet: true });
    if (AXE_AT.includes(v.name)) await wcag(page);
    await t.press(page.getByTestId('controls-done'));
    await expect(page.getByTestId('controls-sheet')).toHaveCount(0);
    await t.press(page.getByRole('button', { name: 'Pause expedition' }));
    await expect(page.getByRole('region', { name: 'Expedition paused' })).toBeVisible();
    await check('paused', {});
    if (AXE_AT.includes(v.name)) await wcag(page);
    // The pause card's Controls row opens the same sheet over the paused game: the card hides while it shows, and Done brings it back.
    await t.press(page.getByTestId('controls-row'));
    await expect(page.getByTestId('controls-sheet')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Expedition paused' })).toHaveCount(0);
    await check('paused-sheet', { sheet: true, paused: true });
    if (AXE_AT.includes(v.name)) await wcag(page);
    await t.press(page.getByTestId('controls-done'));
    await expect(page.getByTestId('controls-sheet')).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Expedition paused' })).toBeVisible();
    expect(all, `${v.name}\n${all.join('\n')}`).toEqual([]);
    expect(t.errors).toEqual([]); await t.context.close();
  });
  if (!v.touch) continue;
  test(`${v.name}: Draw (the lab surface) and Twin stick keep the same clean top row and a free surface`, async ({ browser }) => {
    test.setTimeout(120000);
    const all: string[] = [];
    for (const [state, opts] of [['playing-lab', { url: '/?controls=draw' }], ['playing-twin', { saved: { touchScheme: 'twin', controlsVersion: 6 } }]] as const) {
      const t = await openLanding(browser, v, opts), { page } = t;
      await t.begin();
      if (state === 'playing-lab') await expect(page.getByTestId('lab-surface')).toHaveCount(1); else await expect(page.getByTestId('touch-stick')).toHaveCount(1);
      for (const p of await audit(page, v, { play: true })) all.push(`${state}: ${p}`);
      expect(t.errors).toEqual([]); await t.context.close();
    }
    expect(all, `${v.name}\n${all.join('\n')}`).toEqual([]);
  });
}

// B3: the 44 px row moves no flight band. The invisible [data-band] marker keeps the pre-cleanup header height, so the twin cluster, the
// look pad and the Gesture Lab zones sit where they did: the bands start under the old header (top + 96 px on a phone in portrait or a
// short narrow landscape, top + 44 px on a wide screen) plus 8 px. These numbers are `main header` bottom + 8 measured on the build
// before the cleanup (6933c1d), and the twin cluster's boxes were identical on both builds at ten viewports.
const BAND_VIEWS: (View & { band: number })[] = [...VIEWS.map((v, i) => ({ ...v, band: [124, 124, 64, 64, 80, 80][i] })),
  ...NARROW.map(v => ({ ...v, band: 124 })), { name: '568x262 touch', width: 568, height: 262, touch: true, band: 116 }];
for (const v of BAND_VIEWS) test(`${v.name}: the touch bands still start ${v.band} px down, where they did before the one-row header`, async ({ browser }) => {
  const t = await openLanding(browser, v);
  await t.begin();
  const band = await t.page.evaluate(() => document.querySelector('main [data-band]')!.getBoundingClientRect().bottom);
  expect(Math.round(band) + 8).toBe(v.band);
  const row = (await t.page.locator('header').boundingBox())!;
  expect(row.height, 'the row itself is 44 px').toBeLessThanOrEqual(44.5);
  await t.context.close();
});
test('375x667 twin: the cluster is the size and place the old header band gave it', async ({ browser }) => {
  const v: View = { name: '375x667', width: 375, height: 667, touch: true };
  const t = await openLanding(browser, v, { saved: { touchScheme: 'twin', controlsVersion: 6 } }), { page } = t;
  await t.begin();
  await expect(page.getByTestId('touch-stick')).toHaveCount(1);
  const layout = computeLayout(375, 667, { top: 0, right: 0, bottom: 0, left: 0 }, 124, { size: 1, flip: false, fire: true, aim: true, tapPad: false });
  expect(layout.cramped).toBe(false);
  for (const b of ['fire', 'rise', 'descend', 'aim'] as const) {
    const spot = layout.buttons[b]!, box = (await page.getByTestId(`${b}-button`).boundingBox())!;
    expect(box.width, `${b} size (the hit circle, 2 x r)`).toBeCloseTo(spot.r * 2, 0);
    expect(box.x + box.width / 2, `${b} x`).toBeCloseTo(spot.x, 0); expect(box.y + box.height / 2, `${b} y`).toBeCloseTo(spot.y, 0);
  }
  await t.context.close();
});

// The top row at larger text (D1). The page's text is in px, so a bigger root font size scales nothing: scaleText doubles (or grows by 1.5)
// every element's own computed size, and each test first checks the text really grew, then audits. The old Vote chip is a long label
// that does not fit beside the readout at 200 percent on a 393 px phone; it is gone in unit 4 (a short Vote pill replaces it, and only
// when the vote works), so 200 percent runs with the vote already sent (no Vote button) and 150 percent runs with the chip showing.
// The Vote pill at 200 percent is unit 4's pass to add. 360 px wide is left out at 200 percent: the skip link (globals.css, top:-70px)
// wraps to several lines there and its bottom edge slides into view over the row, a global rule that is not unit 2's.
const SENT = { 'halaverga.vote.v1': JSON.stringify({ round: VOTE_ROUND, touch: { at: Date.now() }, desktop: { at: Date.now() } }) };
const TEXT_AT: [View, number, boolean][] = [
  [{ name: '393x852 touch', width: 393, height: 852, touch: true }, 2, true], [{ name: '375x667 touch', width: 375, height: 667, touch: true }, 2, true],
  [{ name: '393x852 touch', width: 393, height: 852, touch: true }, 1.5, false],
];
for (const [v, f, sent] of TEXT_AT) test(`${v.name} at ${f * 100} percent text${sent ? ', vote already sent' : ', with the Vote chip'}: the text really grows and the top row still fits`, async ({ browser }) => {
  const t = await openLanding(browser, v, sent ? { storage: SENT } : {}), { page } = t;
  await t.begin();
  await expect(page.getByTestId('controls-trigger')).toBeVisible();
  expect(await page.getByTestId('vote-chip').count(), sent ? 'a sent vote has no chip' : 'the chip is in the row').toBe(sent ? 0 : 1);
  const { before, after } = await scaleText(page, f);
  expect(before.every(n => n > 0), `probes found: ${before}`).toBe(true);
  expect(after, 'the probes (Controls, the altitude number, the readout unit) grew by the factor').toEqual(before.map(n => n * f));
  const problems = await audit(page, v, { play: true, scale: f });
  expect(problems, problems.join('\n')).toEqual([]);
  await t.context.close();
});

// Forced colors (D4): the Pause icon is drawn in the button's own text colour, and the row still fits.
test('1440x900 forced colors: the Pause icon takes the button text colour and the row is clean', async ({ browser }) => {
  const v: View = { name: '1440x900 mouse', width: 1440, height: 900, touch: false };
  const t = await openLanding(browser, v), { page } = t;
  await page.emulateMedia({ forcedColors: 'active' });
  await t.begin();
  const [fill, color] = await page.evaluate(() => {
    const b = document.querySelector('button[aria-label="Pause expedition"]')!;
    return [getComputedStyle(b.querySelector('path')!).fill, getComputedStyle(b).color];
  });
  expect(fill, 'the icon is currentColor, which is ButtonText here').toBe(color);
  const problems = await audit(page, v, { play: true });
  expect(problems, problems.join('\n')).toEqual([]);
  await t.context.close();
});
