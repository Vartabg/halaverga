import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { computeLayout } from '../src/game/touchLayout';
import { NARROW, VIEWS, audit, openLanding, type View } from './layout-audit';
// The screen cleanup's layout checker (spec section 10.1): at six viewports, in each state, no two controls overlap, every target is
// 44 x 44 or more, everything is inside the screen, the readout is passive, and the flight surface still gets the gestures (on touch the
// gaps between the top-row buttons too). The two narrow phones (360, 320) and a 200 percent text size cover the top row's squeeze.
// System Chrome emulation: the layout, never the feel of a thumb on a real iPhone.
const wcag = async (page: import('@playwright/test').Page) =>
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([]);
const AXE_AT = ['393x852 touch', '1440x900 mouse'];

for (const v of [...VIEWS, ...NARROW]) {
  test(`${v.name}: landing, playing, sheet and paused have no overlap, small target or lost surface`, async ({ browser }) => {
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

// The top row at 200 percent text: nothing overlaps or leaves the screen.
test('393x852 at 200 percent root text size: the top row still fits', async ({ browser }) => {
  const v: View = { name: '393x852 touch', width: 393, height: 852, touch: true };
  const t = await openLanding(browser, v, { fontSize: '200%' }), { page } = t;
  await t.begin();
  const problems = await audit(page, v, { play: true });
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
