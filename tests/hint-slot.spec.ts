import { expect, test } from '@playwright/test';
import { hintSlot, labPage, said } from './lab-browser';
import { openSheet, row, saved, sheet } from './controls-browser';
import { ONE_DESK, votePage } from './vote-browser';
// The one hint slot's timing, as a player sees it (every title starts with @hint, so `-g "@hint"` runs exactly these): a message waits under a dialog
// and then has its 4 s; the controls lesson's clocks wait while the slot is busy and come back after Resume until the first takeoff; the record line is a
// Read button; the first way flown for 20 s gets one line. System Chrome emulation: the wiring, never how it reads on an iPhone.
const CAPTURED = { desktopMode: 'trackpad', trackpadSteering: 'captured', flowIntroSeen: true } as const;
const lesson = (p: import('@playwright/test').Page) => p.getByTestId('controls-hint');
const ONE_WAY = 'One way flown. Try another for 20 s, then vote.';
const TERMINAL = { checkpoint: { x: -6, y: 21.1, z: 60 }, flowIntroSeen: true };

test('@hint D6: a control picked under the open sheet is named once the sheet closes, for its 4 s', async ({ browser }) => {
  const t = await labPage(browser, 'standard', { viewport: { width: 1440, height: 900 } }), { page } = t;
  await openSheet(page);
  await row(page, 'one-finger-keys').click(); // a pointer pick on desktop keeps the sheet open
  await expect(sheet(page)).toBeVisible();
  await expect(hintSlot(page)).toHaveCount(0); // the slot says nothing under a dialog...
  expect(await said(page)).toContain('One finger + keys controls'); // ...but the switch is announced
  await page.waitForTimeout(5000); // longer than the message's 4 s: its clock waits while the sheet covers the slot
  await expect(hintSlot(page)).toHaveCount(0);
  await sheet(page).getByTestId('controls-done').click();
  await expect(hintSlot(page)).toHaveText('One finger + keys controls');
  await expect(hintSlot(page)).toHaveAttribute('data-kind', 'message');
  const shown = Date.now();
  await expect(hintSlot(page).filter({ hasText: 'One finger + keys controls' })).toHaveCount(0, { timeout: 7000 });
  expect(Date.now() - shown, 'on screen for about 4 s').toBeGreaterThan(3000);
  expect(t.errors).toEqual([]); await t.context.close();
});

test('@hint G1: a 6 s lesson keeps its clock while the sheet covers the slot, and goes after its own 6 s', async ({ browser }) => {
  const t = await labPage(browser, 'standard', { viewport: { width: 1440, height: 900 }, saved: CAPTURED }), { page } = t;
  await expect(lesson(page)).toHaveText('Hold C to fire');
  await expect(lesson(page)).toHaveAttribute('data-track', 'line');
  await page.waitForTimeout(1200);
  await openSheet(page);
  await expect(hintSlot(page)).toHaveCount(0);
  await page.waitForTimeout(7500); // more than the whole 6 s: it would be gone if the clock ran under the sheet
  await sheet(page).getByTestId('controls-done').click();
  await expect(lesson(page)).toHaveText('Hold C to fire');
  const back = Date.now();
  await expect(lesson(page)).toHaveCount(0, { timeout: 9000 });
  expect(Date.now() - back, 'the rest of its 6 s, not a fresh 6 s').toBeLessThan(6500);
  expect(t.errors).toEqual([]); await t.context.close();
});

test('@hint a 6 s lesson comes back after each Resume until the first takeoff, and not after', async ({ browser }) => {
  const t = await labPage(browser, 'standard', { viewport: { width: 1440, height: 900 }, saved: CAPTURED }), { page } = t;
  const pauseResume = async () => {
    await page.getByRole('button', { name: 'Pause expedition' }).click();
    await page.getByRole('button', { name: 'Resume flight' }).click();
    await expect(page.getByRole('button', { name: 'Pause expedition' })).toBeVisible();
  };
  await expect(lesson(page)).toHaveText('Hold C to fire');
  await expect(lesson(page)).toHaveCount(0, { timeout: 9000 }); // its 6 s
  await pauseResume();
  await expect(lesson(page)).toHaveText('Hold C to fire'); // re-armed: the player has not flown yet
  await expect(lesson(page)).toHaveCount(0, { timeout: 9000 });
  await page.keyboard.press('Space');
  await expect(page.getByTestId('flight-telemetry')).toHaveAttribute('data-flying', 'true');
  await page.waitForTimeout(600);
  await pauseResume();
  await page.waitForTimeout(1500);
  await expect(lesson(page)).toHaveCount(0); // flown: it does not come back
  expect(t.errors).toEqual([]); await t.context.close();
});

test('@hint the record line is a Read button: it pauses, opens the Field guide and remembers the find', async ({ browser }) => {
  const t = await labPage(browser, 'standard', { viewport: { width: 1440, height: 900 }, saved: { checkpoint: { x: -6, y: 21.1, z: 60 }, flowIntroSeen: true } }), { page } = t;
  await expect(hintSlot(page)).toHaveAttribute('data-kind', 'record', { timeout: 15000 });
  await expect(hintSlot(page).getByRole('button')).toHaveText('◇ Municipal record · Read ↗');
  await hintSlot(page).getByRole('button').click();
  await expect(page.getByRole('dialog').getByRole('heading', { name: 'Field guide' })).toBeVisible({ timeout: 15000 });
  expect((await saved(page)).discovered).toBe(true);
  expect(t.errors).toEqual([]); await t.context.close();
});

test('@hint C3: the first way to reach 20 s puts one line in the slot (once, and only if you watched it); arriving with a way flown does not', async ({ browser }) => {
  const t = await votePage(browser, { 'desktop:cursor': 15 }), { page } = t;
  await expect(hintSlot(page).filter({ hasText: ONE_WAY })).toHaveCount(0);
  await page.waitForTimeout(2600); // Begin's own press is outside the 2 s input window by now
  await page.keyboard.down('ArrowRight');
  await expect(hintSlot(page)).toHaveText(ONE_WAY, { timeout: 25000 }); // the seconds ran out while the key was held
  await page.keyboard.up('ArrowRight');
  await expect(hintSlot(page)).toHaveAttribute('data-kind', 'message');
  expect(await said(page)).toContain(ONE_WAY);
  await expect(hintSlot(page).filter({ hasText: ONE_WAY })).toHaveCount(0, { timeout: 8000 }); // a 4 s message
  await page.keyboard.down('ArrowLeft'); await page.waitForTimeout(2500); await page.keyboard.up('ArrowLeft');
  await expect(hintSlot(page).filter({ hasText: ONE_WAY })).toHaveCount(0); // once per page load
  expect(t.errors).toEqual([]); await t.context.close();
  const had = await votePage(browser, ONE_DESK);
  await had.page.waitForTimeout(1800);
  expect(await said(had.page)).not.toContain(ONE_WAY); // someone who arrives with a way flown is not told
  expect(had.errors).toEqual([]); await had.context.close();
});

test('@hint the Read button shows its keyboard focus ring: no ancestor clips it (WCAG 2.4.7)', async ({ browser }) => {
  const t = await labPage(browser, 'standard', { viewport: { width: 1440, height: 900 }, saved: TERMINAL }), { page } = t;
  await expect(hintSlot(page)).toHaveAttribute('data-kind', 'record', { timeout: 15000 });
  const read = hintSlot(page).getByRole('button');
  for (let i = 0; i < 8 && !(await read.evaluate(b => b === document.activeElement)); i++) await page.keyboard.press('Tab');
  await expect(read).toBeFocused();
  expect(await read.evaluate(b => b.matches(':focus-visible'))).toBe(true);
  // The ring is drawn outside the button (outline offset plus width): every ancestor that clips must still hold all of it.
  const clipped = await read.evaluate(b => {
    const cs = getComputedStyle(b), grow = parseFloat(cs.outlineOffset) + parseFloat(cs.outlineWidth), r = b.getBoundingClientRect(), out: string[] = [];
    for (let a = b.parentElement; a && a !== document.documentElement; a = a.parentElement) {
      const s = getComputedStyle(a), clips = s.overflowX !== 'visible' || s.overflowY !== 'visible' || s.clipPath !== 'none' || /paint/.test(s.contain);
      const q = a.getBoundingClientRect(), bw = parseFloat(s.borderLeftWidth) + 0;
      if (clips && (r.left - grow < q.left + bw - .5 || r.top - grow < q.top + bw - .5 || r.right + grow > q.right - bw + .5 || r.bottom + grow > q.bottom - bw + .5)) out.push(`${a.tagName.toLowerCase()}.${String(a.className).slice(0, 30)} clips the ring (overflow ${s.overflowX}/${s.overflowY})`);
    }
    return out;
  });
  expect(clipped).toEqual([]);
  // And the pixels say so: the middle of the ring's left edge is the lime of the global focus outline.
  const box = (await read.boundingBox())!, x = Math.floor(box.x - 6.5), y = Math.round(box.y + box.height / 2);
  const png = (await page.screenshot({ clip: { x, y, width: 1, height: 1 } })).toString('base64');
  const px = await page.evaluate(async b64 => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const c = document.createElement('canvas'); c.width = c.height = 1; const g = c.getContext('2d')!; g.drawImage(img, 0, 0); return Array.from(g.getImageData(0, 0, 1, 1).data);
  }, png);
  expect(Math.abs(px[0] - 212) + Math.abs(px[1] - 241) + Math.abs(px[2] - 151), `the ring's pixel is ${px.slice(0, 3)}`).toBeLessThan(24);
  expect(t.errors).toEqual([]); await t.context.close();
});
