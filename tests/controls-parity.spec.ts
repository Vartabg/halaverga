import { expect, test, type Locator, type Page } from '@playwright/test';
import { controlsFor, settingsFor, type ControlFamily, type ControlId } from '../src/game/controlTypes';
import { CONTROLS_VERSION } from '../src/game/store';
import { labPage } from './lab-browser';
import { controlId, openSheet, paused, rowIds, sheet, trigger } from './controls-browser';
// Parity of the three ways to choose a control (controls picker, 2026-09-28): the header sheet, the old way of a ?controls= session
// override, and a saved choice seeded in localStorage before load. For each of the ten ids on its family(ies) all three must mount
// the identical layer, and Flight settings must show the same current radio. Then the lists in the sheet, Flight settings, the pause
// card and the Field guide must be the same list. System Chrome emulation: desktop 1440x1000 without touch, phone 852x393 with touch
// emulation. It checks wiring and semantics, never how a control feels on a real iPhone or Mac trackpad. /api/vote is not touched here.
const PHONE = { width: 852, height: 393 }, DESKTOP = { width: 1440, height: 1000 };
const FAMILIES: Record<ControlFamily, { touch: boolean; viewport: { width: number; height: number } }> = {
  desktop: { touch: false, viewport: DESKTOP }, touch: { touch: true, viewport: PHONE },
};
// Flow's first-run welcome is dismissed in every seeded save, so it never covers the page in one path only. The current controlsVersion
// keeps hydrateGame's one-time controls migration from resetting a seeded steering or touch scheme to its default.
const SEED = { flowIntroSeen: true, controlsVersion: CONTROLS_VERSION };

/** The mounted layer, as the page shows it: the flight surface, the trackpad pill, the huds, the lab surface and the html data attributes. */
const signature = (page: Page) => page.evaluate(() => {
  const q = (id: string) => document.querySelector<HTMLElement>(`[data-testid=${id}]`);
  const surface = q('flight-surface'), pill = document.querySelector('[class*="trackpadHint"]'), html = document.documentElement.dataset;
  return {
    surface: surface ? { scheme: surface.dataset.scheme ?? null, layout: surface.dataset.layout ?? null } : null,
    pill: pill?.textContent ?? null, labSurface: !!q('lab-surface'), flowHud: !!q('flow-hud'), touchCluster: !!q('touch-stick'), controls: html.controls ?? null, controlId: html.controlId ?? null, touchBlast: html.touchBlast ?? null,
  };
});
const tapOrClick = (l: Locator, touch: boolean) => touch ? l.tap() : l.click();
/** The radio values of the list inside `root`, opening its folded details first (short screens fold the shared section). */
async function listIds(root: Locator, touch: boolean): Promise<string[]> {
  const section = root.getByTestId('controls-section');
  if (await section.count()) {
    const open = await section.locator('details').evaluate(d => (d as HTMLDetailsElement).open);
    if (!open) await tapOrClick(section.locator('summary'), touch); // a mouse click on a touch page would flip the family
  }
  const list = root.getByTestId('controls-list');
  await expect(list).toBeVisible();
  return list.locator('input[type=radio]').evaluateAll(els => els.map(e => (e as HTMLInputElement).value));
}
const checkedIn = (root: Locator) => root.getByTestId('controls-list').locator('input[type=radio]:checked').evaluateAll(els => els.map(e => (e as HTMLInputElement).value));

/** Flight settings' list: the same current radio as the layer that is mounted. Closes the dialog again. */
async function settingsCurrent(page: Page, touch: boolean): Promise<string[]> {
  await tapOrClick(page.getByRole('button', { name: 'Flight settings' }), touch);
  const dialog = page.locator('dialog[open]');
  await expect(dialog).toHaveCount(1);
  await listIds(dialog, touch);
  const checked = await checkedIn(dialog);
  await tapOrClick(page.getByRole('button', { name: 'Close dialog' }), touch);
  await expect(page.getByRole('button', { name: 'Pause expedition' })).toBeVisible();
  return checked;
}
/** Waits until the page shows `id` (the html dataset the trigger sets), then a moment for the remounted layers to settle. */
async function settled(page: Page, id: string) {
  await expect.poll(() => controlId(page)).toBe(id);
  await page.waitForTimeout(400);
}

const ids = (family: ControlFamily) => controlsFor(family).map(c => c.id);
for (const family of ['desktop', 'touch'] as const) {
  const { touch, viewport } = FAMILIES[family];
  for (const id of ids(family)) {
    test(`${family} ${id}: the sheet, ?controls= and a saved choice mount the same layer and Flight settings agrees`, async ({ browser }) => {
      test.setTimeout(240000);
      const found: Record<string, Awaited<ReturnType<typeof signature>>> = {}, current: Record<string, string[]> = {};
      // 1. Chosen in the header sheet from the family's default.
      {
        const t = await labPage(browser, 'standard', { touch, viewport, saved: SEED }), { page } = t;
        await openSheet(page, touch);
        expect(await rowIds(page)).toEqual(ids(family));
        await tapOrClick(page.getByTestId('controls-sheet').locator(`[data-control="${id}"]`), touch);
        await settled(page, id);
        found.sheet = await signature(page); current.sheet = await settingsCurrent(page, touch);
        expect(t.errors).toEqual([]); await t.context.close();
      }
      // 2. The old way for a session: ?controls=<id> (nothing saved).
      {
        const t = await labPage(browser, id, { touch, viewport, saved: SEED }), { page } = t;
        await settled(page, id);
        found.query = await signature(page); current.query = await settingsCurrent(page, touch);
        expect(t.errors).toEqual([]); await t.context.close();
      }
      // 3. The old way for good: the persisted store seeded before load, a plain URL.
      {
        const t = await labPage(browser, 'standard', { touch, viewport, saved: { ...SEED, ...settingsFor(id) } }), { page } = t;
        await settled(page, id);
        found.saved = await signature(page); current.saved = await settingsCurrent(page, touch);
        expect(t.errors).toEqual([]); await t.context.close();
      }
      expect(found.query, 'query equals sheet').toEqual(found.sheet);
      expect(found.saved, 'saved equals sheet').toEqual(found.sheet);
      // The layer is the right one for the id, not only the same one.
      const lab = ['draw', 'conduct', 'brush'].includes(id);
      expect(found.sheet.labSurface).toBe(lab);
      expect(found.sheet.controls).toBe(lab ? id : null);
      expect(found.sheet.controlId).toBe(id);
      if (id === 'twin-stick') expect(found.sheet.surface?.scheme).toBe('twin');
      if (id === 'one-finger' || id === 'cursor') expect(found.sheet.surface?.scheme).toBe('classic');
      expect(found.sheet.flowHud).toBe(id === 'flow');
      for (const key of ['sheet', 'query', 'saved']) expect(current[key], `Flight settings (${key})`).toEqual([id]);
    });
  }
}

for (const family of ['desktop', 'touch'] as const) {
  const { touch, viewport } = FAMILIES[family];
  test(`${family}: Flight settings, the pause card and the Field guide list exactly what the sheet lists`, async ({ browser }) => {
    test.setTimeout(180000);
    const t = await labPage(browser, 'standard', { touch, viewport, saved: SEED }), { page } = t;
    await openSheet(page, touch);
    const inSheet = await rowIds(page);
    expect(inSheet).toEqual(ids(family));
    // Close the sheet: Done, so no control is picked and nothing else changes.
    await tapOrClick(sheet(page).getByTestId('controls-done'), touch);
    await expect(sheet(page)).toHaveCount(0);

    // Flight settings.
    await tapOrClick(page.getByRole('button', { name: 'Flight settings' }), touch);
    const dialog = page.locator('dialog[open]');
    await expect(dialog).toHaveCount(1);
    expect(await listIds(dialog, touch), 'Flight settings').toEqual(inSheet);
    await tapOrClick(page.getByRole('button', { name: 'Close dialog' }), touch);
    await expect(page.getByRole('button', { name: 'Pause expedition' })).toBeVisible();

    // The Field guide (a text dialog with the same list under 'Try every control').
    await tapOrClick(page.getByRole('button', { name: 'Field guide' }), touch);
    const guide = page.locator('dialog[open]');
    await expect(guide).toHaveCount(1);
    await expect(guide.getByRole('heading', { name: 'Try every control' })).toBeVisible();
    expect(await listIds(guide, touch), 'Field guide').toEqual(inSheet);
    await tapOrClick(page.getByRole('button', { name: 'Close dialog' }), touch);
    await expect(page.getByRole('button', { name: 'Pause expedition' })).toBeVisible();

    // The pause card.
    await tapOrClick(page.getByRole('button', { name: 'Pause expedition' }), touch);
    await expect(paused(page)).toBeVisible();
    expect(await listIds(paused(page), touch), 'pause card').toEqual(inSheet);
    // Picking in the pause card is the same pick as in the sheet: it mounts on Resume and the trigger names it.
    const other = inSheet[1] as ControlId;
    await tapOrClick(paused(page).getByTestId('controls-list').locator(`[data-control="${other}"]`), touch);
    await expect(checkedIn(paused(page))).resolves.toEqual([other]);
    await tapOrClick(paused(page).getByRole('button', { name: 'Resume flight' }), touch);
    await settled(page, other);
    await expect(trigger(page)).toContainText(other === 'twin-stick' ? 'Twin stick' : 'One finger + keys');
    expect(t.errors).toEqual([]); await t.context.close();
  });
}

test('?controls=bogus is ignored and still lets Begin enable: the family default plays', async ({ browser }) => {
  const t = await labPage(browser, 'standard', { url: '/?controls=bogus', saved: SEED }), { page } = t;
  await expect(trigger(page)).toHaveText('Controls: Cursor');
  expect(await controlId(page)).toBe('cursor');
  expect((await signature(page)).labSurface).toBe(false);
  expect(t.errors).toEqual([]); await t.context.close();
});
test('?controls=<id> stays this session only: the saved choice is untouched, a plain URL starts on the default', async ({ browser }) => {
  const t = await labPage(browser, 'flow', { saved: SEED }), { page } = t;
  await settled(page, 'flow');
  // A reload saves on pagehide: the pinned field still writes its saved value, not the session's Flow.
  await page.reload();
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('halaverga-flight-v1') || '{}'));
  expect(after.trackpadSteering ?? 'free').toBe('free');
  await page.goto('/'); await page.getByRole('button', { name: 'Begin expedition' }).click();
  await expect(trigger(page)).toHaveText('Controls: Cursor');
  expect(t.errors).toEqual([]); await t.context.close();
});
