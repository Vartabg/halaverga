import { expect, test, type Browser, type Locator } from '@playwright/test';
import { labPage, tel, type Pt } from './lab-browser';
import { box, controlId, paused, sheet } from './controls-browser';
// Real touches (Chrome's DevTools touch pipeline, not synthesized clicks) on the phone's top row and the Controls sheet. Two things must
// hold together: the strip between the readout and the buttons, and the 8 px gaps between the buttons, are flight surface (the header
// passes touches through; only its buttons take them), and the sheet, its backdrop and its radios stay fully touchable even though they
// sit next to a pass-through header. System Chrome emulation, not an iPhone: Garo checks the real thumb (screen cleanup spec 10.4).
const PHONES = [{ width: 375, height: 667 }, { width: 852, height: 393 }] as const;
const SHORT = [{ width: 667, height: 320 }, { width: 320, height: 568 }] as const; // the sheet's list overflows here (a short landscape phone, and the smallest portrait one), so it has to scroll by touch
type Page = Awaited<ReturnType<typeof labPage>>;
const phone = (browser: Browser, viewport: { width: number; height: number }) =>
  labPage(browser, 'standard', { touch: true, viewport, saved: { flowIntroSeen: true } });
const centre = (b: { x: number; y: number; width: number; height: number }): Pt => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });
/** A tap through the touch pipeline: down, a beat, up. */
async function tapAt(t: Page, p: Pt) { await t.send('touchStart', [{ id: 1, ...p }]); await t.page.waitForTimeout(60); await t.send('touchEnd', []); }
const trigger = (t: Page) => t.page.getByTestId('controls-trigger');
const pauseButton = (t: Page) => t.page.getByRole('button', { name: 'Pause expedition' });
async function openSheet(t: Page) { await tapAt(t, centre(await box(trigger(t)))); await expect(sheet(t.page)).toBeVisible(); }

for (const viewport of PHONES) {
  const at = `${viewport.width}x${viewport.height}`;
  test(`${at}: a real touch opens the sheet, picks a row, closes with Done and with the backdrop, and never reaches the flight surface`, async ({ browser }) => {
    const t = await phone(browser, viewport), { page } = t;
    await openSheet(t);
    // A row: a touch pick closes the sheet at once and switches the control.
    await tapAt(t, centre(await box(sheet(page).locator('[data-control="twin-stick"]'))));
    await expect(sheet(page)).toHaveCount(0);
    await expect.poll(() => controlId(page)).toBe('twin-stick');
    // Done closes it without picking anything.
    await openSheet(t);
    await tapAt(t, centre(await box(page.getByTestId('controls-done'))));
    await expect(sheet(page)).toHaveCount(0);
    await expect.poll(() => controlId(page)).toBe('twin-stick');
    // The backdrop: a touch on the world closes the sheet and does nothing else (no flight, no pause).
    await openSheet(t);
    await tapAt(t, { x: 12, y: viewport.height - 14 });
    await expect(sheet(page)).toHaveCount(0);
    await expect(paused(page)).toHaveCount(0);
    expect((await tel(page)).flying).toBe(false);
    expect(t.errors).toEqual([]); await t.context.close();
  });

  test(`${at}: one touch on Pause, with the sheet open, pauses and closes it`, async ({ browser }) => {
    const t = await phone(browser, viewport), { page } = t;
    await openSheet(t);
    await tapAt(t, centre(await box(pauseButton(t)))); // Pause sits above the backdrop: no first tap spent on closing it
    await expect(paused(page)).toBeVisible();
    await expect(sheet(page)).toHaveCount(0);
    expect(t.errors).toEqual([]); await t.context.close();
  });

  // FEEL: the top strip passes touches through. A held touch on the surface is the classic one-finger takeoff, so a finger put down in
  // the strip between the readout and the buttons must lift off. The 8 px gaps between the buttons must hit the surface too (the exact
  // hit test), but a real touch there is not asserted: Chrome snaps a touch within a few px of a button to that button.
  test(`${at}: a finger held in the strip beside the readout flies, and the gaps between the top-row buttons are the surface`, async ({ browser }) => {
    const t = await phone(browser, viewport), { page } = t;
    const readout = await box(page.getByTestId('flight-telemetry'));
    const row = (await Promise.all([...await page.locator('header button').all()].map(b => box(b)))).sort((a, b) => a.x - b.x);
    expect(row.length, 'Controls and Pause at least').toBeGreaterThanOrEqual(2);
    const y = row[0].y + row[0].height / 2, strip: Pt = { x: (readout.x + readout.width + row[0].x) / 2, y };
    expect(row[0].x - (readout.x + readout.width), 'a strip wide enough for a thumb').toBeGreaterThan(24);
    const gaps = row.slice(1).map((b, i) => ({ x: (row[i].x + row[i].width + b.x) / 2, y }));
    for (const p of [strip, ...gaps]) {
      expect(await page.evaluate(({ x, y }) => { const e = document.elementFromPoint(x, y); return !e?.closest('button') && !!e?.closest('[data-play-surface]'); }, p),
        `(${Math.round(p.x)}, ${Math.round(p.y)}) hits the flight surface`).toBe(true);
    }
    expect(Math.min(...row.slice(1).map((b, i) => b.x - (row[i].x + row[i].width))), 'the gaps are 8 px').toBeGreaterThanOrEqual(7.5);
    await t.finger.down(strip); await page.waitForTimeout(1100);
    expect((await tel(page)).flying, 'a finger held in the strip lifts off').toBe(true);
    await t.finger.up();
    expect(t.errors).toEqual([]); await t.context.close();
  });

  // A second finger on Pause (and on Controls) while the first one flies (addendum B2). Chrome's emulation sends no click for a second touch (with or
  // without the pass-through), and iOS Safari is believed to follow the same one-touch-one-click rule, so the buttons act on the second finger's
  // pointerup (secondFingerTap). The pointer events are logged too, so the test says what reached the button. Whether the real iPhone sends
  // the same events is Garo's check: this is the emulation, not a phone.
  async function secondFinger(t: Page, viewport: { width: number; height: number }, target: (t: Page) => Locator) {
    const { page } = t, first: Pt = { x: Math.round(viewport.width * .25), y: Math.round(viewport.height * .7) }, pb = centre(await box(target(t)));
    await page.evaluate(() => {
      const w = window as unknown as { __second: string[] }; w.__second = [];
      for (const b of document.querySelectorAll('header button')) for (const type of ['pointerdown', 'pointerup', 'click']) b.addEventListener(type, e => w.__second.push(`${(b.getAttribute('aria-label') ?? '').split(':')[0]}:${type}:${(e as PointerEvent).pointerType ?? ''}`), true);
    });
    await t.finger.down(first); await page.waitForTimeout(1100);
    expect((await tel(page)).flying, 'the first finger flies').toBe(true);
    await t.send('touchStart', [{ id: 1, ...first }, { id: 2, ...pb }]); await page.waitForTimeout(80);
    await t.send('touchEnd', [{ id: 2, ...pb }]); await page.waitForTimeout(250); // the second finger lifts: a tap
    return { first, events: () => page.evaluate(() => (window as unknown as { __second: string[] }).__second) };
  }
  test(`${at}: a second finger tapping Pause while the first flies pauses (no click needed)`, async ({ browser }) => {
    const t = await phone(browser, viewport), { page } = t;
    const two = await secondFinger(t, viewport, pauseButton);
    expect(await two.events(), 'the second finger reaches Pause as touch pointer events, and Chrome sends no click for it').toEqual(['Pause expedition:pointerdown:touch', 'Pause expedition:pointerup:touch']);
    await expect(paused(page), 'the second finger paused the game').toBeVisible();
    await t.finger.up(); // the first finger lifts after the pause: nothing throws, the card stays
    await expect(paused(page).getByTestId('controls-row')).toBeVisible(); // the card's Controls row is a lazy chunk: the card re-centres when it lands, so measure Resume after
    await tapAt(t, centre(await box(paused(page).getByRole('button', { name: 'Resume flight' })))); // and Resume plays on, with no hold left over from the first finger
    await expect(paused(page)).toHaveCount(0);
    expect(t.errors).toEqual([]); await t.context.close();
  });
  test(`${at}: a second finger tapping Controls while the first flies opens the sheet once`, async ({ browser }) => {
    const t = await phone(browser, viewport), { page } = t;
    const two = await secondFinger(t, viewport, trigger);
    expect((await two.events()).filter(e => e.startsWith('Controls')), 'the second finger reaches Controls as touch pointer events').toEqual(['Controls:pointerdown:touch', 'Controls:pointerup:touch']);
    await expect(sheet(page), 'the second finger opened the sheet').toBeVisible();
    await page.waitForTimeout(900); // a browser that also sent a click would have shut it again by now
    await expect(sheet(page)).toBeVisible();
    await t.finger.up();
    await tapAt(t, centre(await box(page.getByTestId('controls-done'))));
    await expect(sheet(page)).toHaveCount(0);
    expect(t.errors).toEqual([]); await t.context.close();
  });
}

for (const short of SHORT) test(`${short.width}x${short.height}: the sheet's list scrolls under a real touch drag, and nothing reaches the flight surface`, async ({ browser }) => {
  const t = await phone(browser, short), { page } = t;
  await openSheet(t);
  const list = sheet(page).locator('[data-scroll-ok]'), overflow = await list.evaluate(e => e.scrollHeight - e.clientHeight); // the list is the one scroller; the footer is not part of it
  expect(overflow, 'the list overflows at this height').toBeGreaterThan(8);
  const b = await box(list), heading = (await tel(page)).heading, from = { x: b.x + b.width / 2, y: b.y + b.height * .6 };
  await t.finger.down(from); await t.finger.drag({ x: from.x, y: from.y - Math.min(overflow + 40, 160) }, 10, 16); await t.finger.up();
  await expect.poll(() => list.evaluate(e => e.scrollTop), { timeout: 3000 }).toBeGreaterThan(4);
  await expect(sheet(page)).toBeVisible();
  expect((await tel(page)).flying).toBe(false); expect((await tel(page)).heading).toBeCloseTo(heading, 3);
  // The last row (Brush) can now be touched: it sits above the footer, whole.
  const last = await box(sheet(page).getByRole('radio').last().locator('xpath=ancestor::label')), foot = await box(page.getByTestId('controls-done'));
  expect(last.y + last.height, 'the last row ends above Done').toBeLessThanOrEqual(foot.y + .5);
  await tapAt(t, centre(foot));
  await expect(sheet(page)).toHaveCount(0);
  expect(t.errors).toEqual([]); await t.context.close();
});
