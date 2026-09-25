import { expect, test, type Page } from '@playwright/test';
import { clearOfDrones, countDraws, startInk, drawStats, guideShown, labPage, lift, tel, type Lab } from './lab-browser';
// Desktop parity (spec 2.6 desktop table) on a non-touch Mac-sized page, system Chrome: click-to-ink strokes (no button held) in
// Draw and Brush, the 650 ms rest commit, Escape cancelling the ink, no phone UI, and the renderer budget per scheme. The pointer
// here is a mouse; a Mac trackpad's own feel is a device check (docs/gesture-lab.md).
const V = { width: 1440, height: 900 };
const locked = (p: Page) => p.evaluate(() => !!document.pointerLockElement);
const paused = (p: Page) => p.getByRole('button', { name: 'Resume flight' }).count();
/** Ink starts: open sky over the corridor, away from the ghost tip (centre right). */
const STARTS = [{ x: 640, y: 460 }, { x: 760, y: 340 }, { x: 600, y: 380 }, { x: 700, y: 520 }];

test('Draw: click, then move to ink; the hero follows the ink, a REST_COMMIT_MS (650 ms) rest commits, and no button is ever held', async ({ browser }) => {
  const t = await labPage(browser, 'draw', { viewport: V }), { page } = t;
  await lift(page);
  const a = await tel(page), o = await startInk(page, STARTS);
  for (let i = 1; i <= 30; i++) { await page.mouse.move(o.x + i * 6, o.y - i * 4); await page.waitForTimeout(16); }
  const inking = await tel(page);
  expect(inking.speed).toBeGreaterThan(8); // already flying the ink
  expect(Math.abs(inking.heading - a.heading)).toBeLessThan(.02); // the view holds while inking
  // Resting the pointer commits: the heading then eases toward the path (to the right).
  await expect.poll(async () => (await tel(page)).heading, { timeout: 4000 }).toBeLessThan(a.heading - .05);
  expect(await locked(page)).toBe(false);
  // Committed: moving the pointer draws nothing new, and the hero glides out and hovers.
  await page.mouse.move(300, 700, { steps: 10 });
  await expect.poll(async () => (await tel(page)).speed, { timeout: 12000 }).toBeLessThan(.3);
  expect(await paused(page)).toBe(0);
  expect(t.errors).toEqual([]); await t.context.close();
});

test('Draw: Escape cancels the ink (the hero glides to a hover); with nothing inked, Escape pauses', async ({ browser }) => {
  const t = await labPage(browser, 'draw', { viewport: V }), { page } = t;
  await lift(page);
  const o = await startInk(page, STARTS);
  for (let i = 1; i <= 20; i++) { await page.mouse.move(o.x + i * 10, o.y - i * 6); await page.waitForTimeout(16); }
  await expect.poll(async () => (await tel(page)).speed).toBeGreaterThan(8);
  await page.keyboard.press('Escape');
  expect(await paused(page)).toBe(0);
  // The pointer no longer inks.
  for (let i = 1; i <= 20; i++) { await page.mouse.move(900 - i * 25, 280 + i * 15); await page.waitForTimeout(16); }
  await expect.poll(async () => (await tel(page)).speed, { timeout: 6000 }).toBeLessThan(.3);
  const h = (await tel(page)).heading;
  await page.waitForTimeout(800); expect(Math.abs((await tel(page)).heading - h)).toBeLessThan(.02);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Resume flight' })).toBeVisible();
  expect(t.errors).toEqual([]); await t.context.close();
});

test('Brush: click, then sweep up soars at once (no second click); a short ink held still shows the guide', async ({ browser }) => {
  const t = await labPage(browser, 'brush', { viewport: V }), { page } = t;
  await lift(page);
  const y0 = (await tel(page)).pos[1], o = await clearOfDrones(page, [{ x: 600, y: 600 }, { x: 800, y: 600 }, { x: 500, y: 650 }]);
  await page.mouse.move(o.x, o.y); await page.mouse.click(o.x, o.y);
  for (let i = 1; i <= 12; i++) { await page.mouse.move(o.x, o.y - 25 * i); await page.waitForTimeout(16); }
  let peak = -Infinity; const end = Date.now() + 2500;
  while (Date.now() < end) { peak = Math.max(peak, (await tel(page)).pos[1] - y0); await page.waitForTimeout(100); }
  test.info().annotations.push({ type: 'hover soar', description: `peak climb ${peak.toFixed(2)} m` });
  expect(peak).toBeGreaterThanOrEqual(5);
  // A new ink under 60 px, then a rest: the guide shows (Brush only) and a later Escape cancels ink and guide.
  const g = await clearOfDrones(page, [{ x: 700, y: 450 }, { x: 560, y: 520 }, { x: 860, y: 520 }]);
  await page.mouse.move(g.x, g.y); await page.mouse.click(g.x, g.y);
  await page.mouse.move(g.x + 20, g.y - 10, { steps: 3 });
  await expect.poll(() => guideShown(page), { timeout: 1500, intervals: [50] }).toBe(true);
  await page.keyboard.press('Escape');
  await expect.poll(() => guideShown(page)).toBe(false);
  expect(await paused(page)).toBe(0);
  expect(t.errors).toEqual([]); await t.context.close();
});

for (const viewport of [V, { width: 325, height: 928 }]) {
  test(`${viewport.width}x${viewport.height}: no phone UI, pause or pointer lock in any lab scheme`, async ({ browser }) => {
    for (const scheme of ['draw', 'conduct', 'brush'] as const) {
      const t = await labPage(browser, scheme, { viewport }), { page } = t;
      await page.mouse.click(Math.round(viewport.width / 2), Math.round(viewport.height * .4));
      await page.waitForTimeout(400);
      for (const id of ['touch-layer', 'fire-button', 'rise-button', 'touch-stick', 'flight-surface']) await expect(page.getByTestId(id), `${scheme} ${id}`).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.dataset.playing ?? null), scheme).toBeNull();
      await expect(page.getByText('Blaster sound is off')).toHaveCount(0);
      expect(await locked(page), scheme).toBe(false);
      expect(await paused(page), scheme).toBe(0);
      await expect(page.getByTestId('lab-bar')).toBeVisible();
      await expect(page.getByTestId('lab-bar').getByRole('radio', { name: /^(Draw|Conduct|Brush)$/, checked: true })).toHaveAttribute('data-lab', scheme);
      await expect(page.getByRole('button', { name: /^(Lift|Land)$/ })).toBeVisible();
      expect(t.errors, scheme).toEqual([]); await t.context.close();
    }
  });
}

// Renderer budget (spec 10): WebGL draw calls and triangles counted per frame (countDraws), medians. Headless Chrome on this Mac,
// not a device: frame times are reported, never judged here.
test('renderer budget at rest: a lab scheme adds at most 2 draw calls and 1.5k triangles over Standard at the same pose', async ({ browser }) => {
  const rows: string[] = [], base: Record<string, { calls: number; tris: number }> = {};
  for (const scheme of ['standard', 'draw', 'conduct', 'brush'] as Lab[]) {
    const t = await labPage(browser, scheme, { viewport: V, init: countDraws }), { page } = t;
    await page.waitForTimeout(1500);
    const s = await drawStats(page, 3000);
    rows.push(`${scheme}: ${s.calls} calls, ${s.tris} tris, ${s.frames} frames, p50 ${s.p50.toFixed(1)} ms, p95 ${s.p95.toFixed(1)} ms`);
    base[scheme] = s;
    expect(t.errors).toEqual([]); await t.context.close();
  }
  test.info().annotations.push({ type: 'renderer at spawn', description: rows.join(' | ') });
  for (const scheme of ['draw', 'conduct', 'brush']) {
    expect(base[scheme].calls - base.standard.calls, scheme).toBeLessThanOrEqual(2);
    expect(base[scheme].tris - base.standard.tris, scheme).toBeLessThanOrEqual(1500);
  }
});

// The world ribbon and the hero trail are transparent DoubleSide materials; forceSinglePass keeps each to one draw call (three.js
// otherwise draws back faces, then front faces), so a flying Draw path costs 2 extra calls, not 4.
test('renderer budget in flight: a drawn path adds at most 2 draw calls and 1.5k triangles over a Standard cruise', async ({ browser }) => {
  const flying: Record<string, { calls: number; tris: number }> = {}, rows: string[] = [];
  for (const scheme of ['standard', 'draw'] as Lab[]) {
    const t = await labPage(browser, scheme, { viewport: V, init: countDraws }), { page } = t;
    if (scheme === 'standard') { await page.keyboard.press('Space'); await page.waitForTimeout(1500); }
    else {
      await lift(page);
      const o = await startInk(page, STARTS);
      for (let i = 1; i <= 30; i++) { await page.mouse.move(o.x + i * 6, o.y - i * 4); await page.waitForTimeout(16); }
    }
    expect((await tel(page)).speed, scheme).toBeGreaterThan(5);
    const f = await drawStats(page, 1500);
    rows.push(`${scheme} flying: ${f.calls} calls, ${f.tris} tris, p50 ${f.p50.toFixed(1)} ms, p95 ${f.p95.toFixed(1)} ms`);
    flying[scheme] = f;
    expect(t.errors).toEqual([]); await t.context.close();
  }
  test.info().annotations.push({ type: 'renderer in flight', description: rows.join(' | ') });
  expect(flying.draw.tris - flying.standard.tris).toBeLessThanOrEqual(1500);
  expect(flying.draw.calls - flying.standard.calls).toBeLessThanOrEqual(2);
});
