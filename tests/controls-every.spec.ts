import { expect, test, type Page } from '@playwright/test';
import { controlById, controlKey, controlsFor, type ControlFamily, type ControlId } from '../src/game/controlTypes';
import { labPage } from './lab-browser';
import { controlId, mockVote, openSheet, paused, playInit, row, sheet, trigger } from './controls-browser';
import { DRIVES } from './controls-every-drive';
// Every control type, end to end (owner 2026-09-28: "all different types of controls available for the demo ... an online vote").
// For each id on its own family: choose it in the Controls sheet, see its input layer mount (data attributes), do one real gesture,
// see no page error and no pause, then vote for it against a mocked /api/vote. Phone rows: 393x852 and 852x393 with touch emulation
// (CDP finger; every tap is a touch so the page stays in the touch family). Desktop row: 1440x900, no touch. System Chrome emulation
// only: it proves the wiring and that each layer answers a real gesture, never how a control feels on an iPhone or a Mac trackpad.
// /api/vote and /api/results are always mocked. Run against a production build on port 3391 only: PLAYTEST_URL=http://127.0.0.1:3391.
const SIZES = [
  { name: 'phone portrait 393x852', family: 'touch' as ControlFamily, touch: true, viewport: { width: 393, height: 852 } },
  { name: 'phone landscape 852x393', family: 'touch' as ControlFamily, touch: true, viewport: { width: 852, height: 393 } },
  { name: 'desktop 1440x900', family: 'desktop' as ControlFamily, touch: false, viewport: { width: 1440, height: 900 } },
];
const LABS: ControlId[] = ['draw', 'conduct', 'brush'];
const tapOrClick = (l: ReturnType<Page['locator']>, touch: boolean) => touch ? l.tap() : l.click();

/** The mounted layer for the id, by the page's own data attributes and test ids. */
async function expectLayer(page: Page, id: ControlId) {
  const lab = LABS.includes(id), hint = page.locator('[class*="trackpadHint"]');
  await expect(trigger(page)).toHaveAccessibleName(`Controls: ${controlById(id).label}`);
  expect(await controlId(page)).toBe(id);
  expect(await page.evaluate(() => document.documentElement.dataset.controls ?? null)).toBe(lab ? id : null);
  await expect(page.getByTestId('lab-surface')).toHaveCount(lab ? 1 : 0);
  await expect(page.getByTestId('flow-hud')).toHaveCount(id === 'flow' ? 1 : 0);
  await expect(page.getByTestId('flight-surface')).toHaveCount(lab ? 0 : 1);
  if (id === 'one-finger' || id === 'cursor') await expect(page.getByTestId('flight-surface')).toHaveAttribute('data-scheme', 'classic');
  if (id === 'twin-stick') await expect(page.getByTestId('flight-surface')).toHaveAttribute('data-scheme', 'twin');
  if (id === 'cursor') await expect(hint).toContainText('SPACE TO FLY');
  if (id === 'captured') await expect(hint).toContainText('CLICK TO FLY');
  if (id === 'one-finger-keys') await expect(page.getByTestId('simple-trackpad-hud').or(page.getByTestId('controls-hint')).first()).toBeVisible();
  if (id === 'mouse-keys' || lab) await expect(page.locator('[class*="trackpadHint"], [data-testid=simple-trackpad-hud], [data-testid=flow-hud]')).toHaveCount(0);
}
const notPaused = async (page: Page) => { await expect(paused(page)).toHaveCount(0); await expect(page.getByRole('button', { name: 'Pause expedition' })).toBeVisible(); };

for (const { name, family, touch, viewport } of SIZES) {
  test.describe(name, () => {
    for (const { id, label } of controlsFor(family)) {
      test(`${label}: chosen in the sheet, mounts its layer, one real gesture, no pause, then a vote`, async ({ browser }) => {
        test.setTimeout(90000);
        // Every control of the family is already tried (21 s > 20 s), this one included: a control only counts as tried after 20 s of
        // play (opening the sheet is not enough), and this test's one gesture is far shorter. The drives never land, so the one auto-open
        // (on a landing, from two tried) does not fire mid-test. The real accrual of tried seconds is tested in vote.spec.ts.
        const others = Object.fromEntries(controlsFor(family).map(c => [controlKey(family, c.id), 21]));
        const saved = { flowIntroSeen: true, ...(touch && (LABS.includes(id) || id === 'twin-stick') ? { autoFire: false } : {}) };
        const t = await labPage(browser, 'standard', { touch, viewport, saved, init: playInit(others) }), { page, finger } = t;
        const bodies = await mockVote(page);

        // 1. Choose it in the sheet (a tap on a phone: a mouse click would flip the family), then close the sheet.
        await openSheet(page, touch);
        await tapOrClick(row(page, id), touch);
        await expect.poll(() => controlId(page)).toBe(id);
        if (!touch) await sheet(page).getByTestId('controls-done').click(); // a touch pick closes the sheet by itself
        await expect(sheet(page)).toHaveCount(0);
        await page.waitForTimeout(400);
        await notPaused(page);
        await expectLayer(page, id);

        // 2. One real gesture on that layer.
        const did = await DRIVES[id]({ page, finger, view: viewport, touch });
        test.info().annotations.push({ type: 'gesture', description: `${name} ${label}: ${did}` });
        await notPaused(page);
        expect(await controlId(page)).toBe(id);

        // 3. Vote for it. Pointer lock (Captured, Mouse + keys, One finger + keys) is given back first; pausing is now on purpose.
        await page.evaluate(() => document.exitPointerLock());
        await expect.poll(() => page.evaluate(() => !!document.pointerLockElement)).toBe(false);
        if (!(await paused(page).isVisible())) await tapOrClick(page.getByRole('button', { name: 'Pause expedition' }), touch);
        await expect(paused(page)).toBeVisible();
        await tapOrClick(page.getByTestId('vote-open'), touch);
        const card = page.getByTestId('vote-card');
        await expect(card).toBeVisible();
        // The ballot lists every way of the family (all are tried), the pick is this one, and nothing is pre-selected.
        await expect(card.getByTestId('vote-choices').getByRole('radio', { checked: true })).toHaveCount(0);
        await tapOrClick(card.getByTestId('vote-choices').getByRole('radio', { name: label, exact: true }), touch);
        await tapOrClick(card.getByRole('button', { name: 'Send vote' }), touch);
        await expect(card.getByRole('status')).toHaveText('Thanks. Your vote is in.');
        expect(bodies).toHaveLength(1);
        expect(Object.keys(bodies[0]).sort()).toEqual(['device', 'favorite', 'last', 'nonce', 'tried', 'v']);
        expect(bodies[0]).toMatchObject({ v: 3, favorite: id, last: id, device: family });
        const tried = bodies[0].tried as string[];
        expect(tried).toContain(id);
        expect(new Set(tried).size).toBe(tried.length);
        expect(tried.slice().sort()).toEqual(controlsFor(family).map(c => c.id).sort());

        expect(t.errors).toEqual([]);
        await t.context.close();
      });
    }
  });
}
