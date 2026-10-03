import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { computeLayout } from '../src/game/touchLayout';
import { VOTE_ROUND } from '../src/lib/vote/ballot';
import { NARROW, VIEWS, audit, openLanding, scaleText, type View } from './layout-audit';
import { PLAYED, rowFormProblems } from './layout-vote';
import { expectSlot } from './layout-hint';
import { landingProblems } from './layout-landing';
// The screen cleanup's layout checker (spec section 10.1): at six viewports, in each state, no two controls overlap, every target is
// 44 x 44 or more, everything is inside the screen, the readout is passive, and the flight surface still gets the gestures (on touch the
// gaps between the top-row buttons too). The two narrow phones (360, 320) and a 200 percent text size cover the top row's squeeze.
// System Chrome emulation: the layout, never the feel of a thumb on a real iPhone.
const wcag = async (page: import('@playwright/test').Page) =>
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([]);
const AXE_AT = ['393x852 touch', '1440x900 mouse'];
// A checkpoint beside the Municipal terminal on the arrival terrace (the terminal is at -7, 21, 58, in reach within 5 m): the record line shows with no message first.
const NEAR_TERMINAL = { x: -6, y: 21.1, z: 60 }, RECORD = '◇ Municipal record · Read ↗';

for (const v of [...VIEWS, ...NARROW]) {
  test(`${v.name}: landing, playing, sheet, paused, paused-sheet and Flight settings (the vote locked) have no overlap, small target or lost surface`, async ({ browser }) => {
    test.setTimeout(120000);
    const t = await openLanding(browser, v), { page } = t, all: string[] = [];
    const check = async (state: string, mode: Parameters<typeof audit>[2]) => { for (const p of await audit(page, v, mode)) all.push(`${state}: ${p}`); };
    await check('landing', {});
    await t.begin(); await check('playing', { play: true, vote: 'locked' });
    if (AXE_AT.includes(v.name)) await wcag(page);
    await t.press(page.getByTestId('controls-trigger'));
    await expect(page.getByTestId('controls-sheet')).toBeVisible();
    await check('sheet', { sheet: true, vote: 'locked' });
    if (AXE_AT.includes(v.name)) await wcag(page);
    await t.press(page.getByTestId('controls-done'));
    await expect(page.getByTestId('controls-sheet')).toHaveCount(0);
    await t.press(page.getByRole('button', { name: 'Pause expedition' }));
    await expect(page.getByRole('region', { name: 'Expedition paused' })).toBeVisible();
    await expect(page.getByTestId('controls-row')).toBeVisible(); // the pause card's Controls row and vote door are one lazy chunk
    await check('paused', { vote: 'locked' });
    if (AXE_AT.includes(v.name)) await wcag(page);
    // The pause card's Controls row opens the same sheet over the paused game: the card hides while it shows, and Done brings it back.
    await t.press(page.getByTestId('controls-row'));
    await expect(page.getByTestId('controls-sheet')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Expedition paused' })).toHaveCount(0);
    await check('paused-sheet', { sheet: true, paused: true, vote: 'locked' });
    if (AXE_AT.includes(v.name)) await wcag(page);
    await t.press(page.getByTestId('controls-done'));
    await expect(page.getByTestId('controls-sheet')).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Expedition paused' })).toBeVisible();
    // Flight settings over the paused game: the dialog fits, nothing in it overlaps or is under 44 px, and its Resume footer is flush.
    await t.press(page.getByRole('region', { name: 'Expedition paused' }).getByRole('button', { name: 'Flight settings', exact: true }));
    await expect(page.getByRole('dialog', { name: 'Flight settings' })).toBeVisible();
    await check('settings', { settings: true });
    if (AXE_AT.includes(v.name)) await wcag(page);
    await t.press(page.getByRole('button', { name: 'Close dialog' }));
    await expect(page.getByRole('region', { name: 'Expedition paused' })).toBeVisible();
    expect(all, `${v.name}\n${all.join('\n')}`).toEqual([]);
    expect(t.errors).toEqual([]); await t.context.close();
  });
  // Two ways flown, an open ballot (the default mock): the one state with a Vote button, in its three places. The same overlap, target and surface
  // checks, plus the vote's rule: the pill beside Controls (8 px), Controls the same width as with the dots, no dots, the sheet's Vote, the pause door.
  test(`${v.name}: with two ways flown the Vote pill, the sheet's Vote and the pause card's door have no overlap, small target or lost surface`, async ({ browser }) => {
    test.setTimeout(120000);
    const t = await openLanding(browser, v, { storage: PLAYED(v) }), { page } = t, all: string[] = [];
    const check = async (state: string, mode: Parameters<typeof audit>[2]) => { for (const p of await audit(page, v, mode)) all.push(`${state}: ${p}`); };
    await t.begin();
    await expect(page.getByTestId('vote-chip')).toBeVisible();
    await check('vote-ready', { play: true, vote: 'ready' });
    if (AXE_AT.includes(v.name)) await wcag(page);
    await t.press(page.getByTestId('controls-trigger'));
    await expect(page.getByTestId('controls-sheet')).toBeVisible();
    await check('vote-ready-sheet', { sheet: true, vote: 'ready' });
    await t.press(page.getByTestId('controls-done'));
    await expect(page.getByTestId('controls-sheet')).toHaveCount(0);
    await t.press(page.getByRole('button', { name: 'Pause expedition' }));
    await expect(page.getByRole('region', { name: 'Expedition paused' })).toBeVisible();
    await expect(page.getByTestId('vote-open')).toBeVisible(); // the door arrives with the lazy chunk
    await check('vote-ready-paused', { vote: 'ready' });
    if (AXE_AT.includes(v.name)) await wcag(page);
    expect(all, `${v.name}\n${all.join('\n')}`).toEqual([]);
    expect(t.errors).toEqual([]); await t.context.close();
  });
  // The hint slot (unit 5), record line: a terminal in reach (a saved checkpoint beside the Municipal terminal) puts one 44 px Read button under the row. The
  // same overlap, target and surface checks hold, and the slot is where --hdr says, centred, passive around the button. The button pauses and opens the guide.
  test(`${v.name}: the hint slot's record line is one 44 px Read button under the row, and the screen stays clean`, async ({ browser }) => {
    test.setTimeout(120000);
    const t = await openLanding(browser, v, { saved: { checkpoint: NEAR_TERMINAL } }), { page } = t;
    await t.begin();
    await expectSlot(page, v, 'record', RECORD);
    const problems = await audit(page, v, { play: true, vote: 'locked' });
    expect(problems, problems.join('\n')).toEqual([]);
    if (AXE_AT.includes(v.name)) await wcag(page);
    await t.press(page.getByTestId('hint-slot').getByRole('button'));
    await expect(page.getByRole('region', { name: 'Expedition paused' }).or(page.getByRole('dialog'))).toBeVisible({ timeout: 15000 });
    expect(t.errors).toEqual([]); await t.context.close();
  });
  if (!v.touch) continue;
  // The classic one-thumb lesson, as the real line (not a stand-in): on every phone it is in the slot, the row and surface checks hold with it up, the
  // slot steps aside under the Controls sheet and comes back when the sheet closes (the lesson's own clocks wait meanwhile).
  test(`${v.name}: the hint slot's real classic lesson sits clean under the row, steps aside for the Controls sheet and returns`, async ({ browser }) => {
    test.setTimeout(120000);
    const t = await openLanding(browser, v), { page } = t;
    await t.begin();
    await expectSlot(page, v, 'coach', 'Drag to fly · tap a drone');
    const problems = await audit(page, v, { play: true, vote: 'locked' }), form = await rowFormProblems(page);
    expect(problems.concat(form.problems), problems.concat(form.problems).join('\n')).toEqual([]);
    if (AXE_AT.includes(v.name)) await wcag(page);
    await t.press(page.getByTestId('controls-trigger'));
    await expect(page.getByTestId('controls-sheet')).toBeVisible();
    await expect(page.getByTestId('hint-slot')).toHaveCount(0);
    await t.press(page.getByTestId('controls-done'));
    await expectSlot(page, v, 'coach', 'Drag to fly · tap a drone');
    expect(t.errors).toEqual([]); await t.context.close();
  });
  test(`${v.name}: Draw (the lab surface) and Twin stick keep the same clean top row and a free surface`, async ({ browser }) => {
    test.setTimeout(120000);
    const all: string[] = [];
    for (const [state, opts] of [['playing-lab', { url: '/?controls=draw' }], ['playing-twin', { saved: { touchScheme: 'twin', controlsVersion: 6 } }]] as const) {
      const t = await openLanding(browser, v, opts), { page } = t;
      await t.begin();
      if (state === 'playing-lab') await expect(page.getByTestId('lab-surface')).toHaveCount(1); else await expect(page.getByTestId('touch-stick')).toHaveCount(1);
      for (const p of await audit(page, v, { play: true })) all.push(`${state}: ${p}`);
      // Twin stick teaches with its own series: the first line is in the slot, as clean as the classic one. The lab has its own ghost guide, so no slot line.
      if (state === 'playing-twin') await expectSlot(page, v, 'coach', 'Left thumb: move');
      else await expect(page.getByTestId('hint-slot')).toHaveCount(0);
      expect(t.errors).toEqual([]); await t.context.close();
    }
    expect(all, `${v.name}\n${all.join('\n')}`).toEqual([]);
  });
}

// The start screen's words (not only its controls): no two of the title, eyebrow, copy, Begin, hint, first-visit demo note, brand, Field guide and footer
// lines touch (12 px of air), nothing is under 11 px, and the sentences a player acts on are 13 px at least. First visit (the demo note shows, the card is
// at its tallest) and return visit, at the six test viewports, the two narrow phones and the sizes a Safari tab gives a current iPhone and an SE
// (393x659 and 390x664 with the toolbars up, 375x553 an SE). The title and the card are one bottom-anchored column, so this holds by construction.
const TABS: View[] = [{ name: '393x659 touch', width: 393, height: 659, touch: true }, { name: '390x664 touch', width: 390, height: 664, touch: true },
  { name: '375x553 touch', width: 375, height: 553, touch: true }, { name: '360x640 touch', width: 360, height: 640, touch: true },
  { name: '393x734 touch', width: 393, height: 734, touch: true }, { name: '430x740 touch', width: 430, height: 740, touch: true }];
for (const v of [...VIEWS, ...NARROW, ...TABS]) for (const visit of ['first', 'return'] as const) test(`${v.name}: landing text, ${visit} visit, never overprints and is never set small`, async ({ browser }) => {
  const t = await openLanding(browser, v, visit === 'return' ? { storage: { 'halaverga.controls.demo.v1': '1' } } : {}), { page } = t;
  expect(await page.getByTestId('demo-note').count(), visit === 'first' ? 'the demo note shows on a first visit' : 'no demo note on a return visit').toBe(visit === 'first' ? 1 : 0); // mounted on a first visit (a landscape phone under 430 px high hides it by CSS)
  const problems = await landingProblems(page, v);
  expect(problems, problems.join('\n')).toEqual([]);
  expect(t.errors).toEqual([]); await t.context.close();
});

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
// every element's own computed size, and each test first checks the text really grew, then audits. Three vote states: sent (no dots, no pill),
// locked (the dots take no width: Controls is the same box as in the other states) and ready (the Vote pill in the row).
// The altitude number is never cut, at any size: with the pill, a phone at larger text has no room for the number beside three buttons, so the
// row wraps the pill under Controls (the one case the header is taller than the 44 px row, `--row-extra`; rowFormProblems) and keeps the number.
// Not covered, because the room is not there: 320 wide at 200 percent (Controls, Pause and the 77 px number are 326 px, locked or ready; the readout is
// clipped there, never over a button), and 360 wide at 200 percent, where the skip link (globals.css, top:-70px) wraps to several lines and its
// bottom edge slides into view over the row, a global rule that is not the row's.
const SENT = { 'halaverga.vote.v1': JSON.stringify({ round: VOTE_ROUND, touch: { at: Date.now() }, desktop: { at: Date.now() } }) };
const P393: View = { name: '393x852 touch', width: 393, height: 852, touch: true }, P375: View = { name: '375x667 touch', width: 375, height: 667, touch: true };
const P430: View = { name: '430x932 touch', width: 430, height: 932, touch: true }, P360: View = { name: '360x740 touch', width: 360, height: 740, touch: true };
const P320: View = { name: '320x568 touch', width: 320, height: 568, touch: true };
type VoteAt = 'sent' | 'locked' | 'ready';
// [view, text factor, vote state, whether the pill must wrap (undefined: either, the checks hold for both)]
const TEXT_AT: [View, number, VoteAt, boolean?][] = [
  [P393, 2, 'sent'], [P375, 2, 'sent'], [P393, 2, 'locked'], [P375, 2, 'locked'],
  [P393, 1.5, 'ready', false], [P375, 1.5, 'ready', false], [P393, 2, 'ready', true], [P375, 2, 'ready', true],
  [P430, 1.5, 'ready'], [P430, 2, 'ready', true], [P360, 1.5, 'ready', true], [P320, 1.5, 'ready', true],
];
for (const [v, f, at, wraps] of TEXT_AT) test(`${v.name} at ${f * 100} percent text, vote ${at}: the text really grows, the number is whole and the top row still fits`, async ({ browser }) => {
  const t = await openLanding(browser, v, at === 'sent' ? { storage: SENT } : at === 'ready' ? { storage: PLAYED(v) } : {}), { page } = t;
  await t.begin();
  await expect(page.getByTestId('controls-trigger')).toBeVisible();
  if (at === 'ready') await expect(page.getByTestId('vote-chip')).toBeVisible();
  expect(await page.getByTestId('vote-chip').count(), at === 'ready' ? 'the pill is in the row' : 'no pill unless the vote works').toBe(at === 'ready' ? 1 : 0);
  expect(await page.getByTestId('vote-dots').locator('i').count(), 'two dots only while locked').toBe(at === 'locked' ? 2 : 0);
  const { before, after } = await scaleText(page, f);
  expect(before.every(n => n > 0), `probes found: ${before}`).toBe(true);
  expect(after, 'the probes (Controls, the altitude number, the readout unit) grew by the factor').toEqual(before.map(n => n * f));
  const problems = await audit(page, v, { play: true, scale: f, ...(at === 'sent' ? {} : { vote: at }) });
  expect(problems, problems.join('\n')).toEqual([]);
  // The number is whole: its box is as wide as its text, and it is the 20 px bold number grown by the factor (so the box is not simply collapsed).
  const num = await page.getByTestId('flight-telemetry').evaluate(e => { const n = e.querySelector('span:last-child') as HTMLElement; return { box: n.clientWidth, text: n.scrollWidth }; });
  expect(num.text, 'the number has a width').toBeGreaterThan(30 * f);
  expect(num.box, `the altitude number is whole at ${f * 100} percent (box ${num.box}, text ${num.text})`).toBeGreaterThanOrEqual(num.text);
  const form = await rowFormProblems(page);
  expect(form.problems, form.problems.join('\n')).toEqual([]);
  if (wraps !== undefined) expect(form.stacked, wraps ? 'the pill wraps under Controls to leave the number its room' : 'the pill stays beside Controls: the number has the room').toBe(wraps);
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
