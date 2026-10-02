import { expect, test, type Browser } from '@playwright/test';
import { labPage, tel, type Pt } from './lab-browser';
import { box, controlId, paused, sheet } from './controls-browser';
// Real touches (Chrome's DevTools touch pipeline, not synthesized clicks) on the phone's top row and the Controls sheet. Two things must
// hold together: the strip between the readout and the buttons, and the 8 px gaps between the buttons, are flight surface (the header
// passes touches through; only its buttons take them), and the sheet, its backdrop and its radios stay fully touchable even though they
// sit next to a pass-through header. System Chrome emulation, not an iPhone: Garo checks the real thumb (screen cleanup spec 10.4).
const PHONES = [{ width: 375, height: 667 }, { width: 852, height: 393 }] as const;
const SHORT = { width: 667, height: 320 } as const; // the sheet's list overflows here, so it has to scroll by touch
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

  // A second finger on Pause while the first one flies. Chrome's emulation never synthesizes a click for a second touch (with or without
  // the pass-through), so this checks what it can: the second finger reaches the Pause button (pointer events land on it), and the first
  // finger's flight is not disturbed. Whether the click fires on an iPhone is Garo's check.
  test(`${at}: a second finger lands on Pause while the first keeps flying`, async ({ browser }) => {
    const t = await phone(browser, viewport), { page } = t;
    const first: Pt = { x: Math.round(viewport.width * .25), y: Math.round(viewport.height * .7) }, pb = centre(await box(pauseButton(t)));
    await page.evaluate(() => {
      const w = window as unknown as { __pause: string[] }; w.__pause = [];
      const b = document.querySelector('button[aria-label="Pause expedition"]')!;
      for (const type of ['pointerdown', 'pointerup']) b.addEventListener(type, e => w.__pause.push(`${type}:${(e as PointerEvent).pointerType}`), true);
    });
    await t.finger.down(first); await page.waitForTimeout(1100);
    expect((await tel(page)).flying).toBe(true);
    await t.send('touchStart', [{ id: 1, ...first }, { id: 2, ...pb }]); await page.waitForTimeout(80);
    await t.send('touchEnd', [{ id: 2, ...pb }]); await page.waitForTimeout(200); // the second finger lifts: a tap on Pause
    expect(await page.evaluate(() => (window as unknown as { __pause: string[] }).__pause), 'the second finger reaches Pause').toEqual(['pointerdown:touch', 'pointerup:touch']);
    expect((await tel(page)).flying, 'the first finger is still flying').toBe(true);
    await t.finger.up();
    expect(t.errors).toEqual([]); await t.context.close();
  });
}

test(`${SHORT.width}x${SHORT.height}: the sheet's list scrolls under a real touch drag, and nothing reaches the flight surface`, async ({ browser }) => {
  const t = await phone(browser, SHORT), { page } = t;
  await openSheet(t);
  const s = sheet(page), overflow = await s.evaluate(e => e.scrollHeight - e.clientHeight);
  expect(overflow, 'the list overflows at this height').toBeGreaterThan(8);
  const b = await box(s), heading = (await tel(page)).heading, from = { x: b.x + b.width / 2, y: b.y + b.height * .4 }; // inside the list, above the sticky footer
  await t.finger.down(from); await t.finger.drag({ x: from.x, y: from.y - Math.min(overflow + 40, 160) }, 10, 16); await t.finger.up();
  await expect.poll(() => s.evaluate(e => e.scrollTop), { timeout: 3000 }).toBeGreaterThan(4);
  await expect(s).toBeVisible();
  expect((await tel(page)).flying).toBe(false); expect((await tel(page)).heading).toBeCloseTo(heading, 3);
  await tapAt(t, centre(await box(page.getByTestId('controls-done'))));
  await expect(s).toHaveCount(0);
  expect(t.errors).toEqual([]); await t.context.close();
});
