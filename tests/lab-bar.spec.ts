import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { labPage, lift, said, tel } from './lab-browser';
// Spec 2: the one-tap lab switcher in the header (Standard · Draw · Conduct · Brush) and keys 1-4. System Chrome emulation
// (touch emulation for the phone rows): it checks wiring, layout and semantics, never how the bar feels on a real iPhone, and
// env(safe-area-inset-*) is 0 here, so "inside the safe areas" is only the viewport check. Run against a production build:
// pnpm build && pnpm exec next start --hostname 127.0.0.1 --port 3391, then PLAYTEST_URL=http://127.0.0.1:3391.
const controls = (p: Page) => p.evaluate(() => document.documentElement.dataset.controls ?? null);
const checkedLab = (p: Page) => p.getByTestId('lab-bar').locator('[aria-checked="true"]').getAttribute('data-lab');
const heading = async (p: Page) => (await tel(p)).heading;
const turned = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(b - a), Math.cos(b - a)));
// Standard on a touch screen uses the twin cluster, whose Rise button reads 'Lift off' on the ground (the header Lift is hidden).
async function liftTwin(p: Page) {
  await p.getByRole('button', { name: 'Lift off', exact: true }).tap();
  await expect.poll(async () => (await tel(p)).flying).toBe(true);
  await p.waitForTimeout(1200);
}

test('while flying, a click on Brush switches at once: no pause, no focus taken, no stuck movement', async ({ browser }) => {
  const t = await labPage(browser, 'standard'), { page } = t, bar = page.getByTestId('lab-bar');
  await expect(bar).toBeVisible();
  await lift(page);
  await page.keyboard.down('KeyW');
  await expect.poll(async () => (await tel(page)).speed).toBeGreaterThan(1.5);
  const t0 = Date.now();
  await bar.getByRole('radio', { name: 'Brush' }).click();
  await expect(page.getByTestId('lab-surface')).toHaveCount(1, { timeout: 500 });
  expect(Date.now() - t0).toBeLessThan(1500);
  await page.keyboard.up('KeyW');
  expect(await controls(page)).toBe('brush');
  expect(await checkedLab(page)).toBe('brush');
  await expect(page.getByRole('button', { name: 'Pause expedition' })).toBeVisible(); // still playing
  expect(await page.evaluate(() => document.activeElement?.getAttribute('role') ?? null)).not.toBe('radio');
  expect(await said(page)).toContain('Brush controls');
  // The held W was dropped by the switch: Brush mounted in the air coasts down to a hover.
  await expect.poll(async () => (await tel(page)).speed, { timeout: 6000 }).toBeLessThan(.3);
  expect((await tel(page)).flying).toBe(true);
  // Picking the current scheme again does nothing.
  // (Only the switch notes count: the first Brush tip may be announced meanwhile, through the guide's own live region.)
  const notes = async () => (await said(page)).filter(s => / controls$/.test(s)).length, said0 = await notes();
  await bar.getByRole('radio', { name: 'Brush' }).click();
  await page.waitForTimeout(300);
  expect(await controls(page)).toBe('brush'); expect(await notes()).toBe(said0);
  expect(t.errors).toEqual([]); await t.context.close();
});

test('key 3 picks Conduct; a 3 typed into a settings field or any text input does not', async ({ browser }) => {
  const t = await labPage(browser, 'standard'), { page } = t, bar = page.getByTestId('lab-bar');
  await expect(bar).toBeVisible();
  // Flight settings: type 3 into the cruise speed field, then close.
  await page.getByRole('button', { name: 'Flight settings' }).click();
  const field = page.getByLabel('Starting cruise speed (m/s)');
  await field.click(); await page.keyboard.press('End'); await page.keyboard.press('3');
  expect(await controls(page)).toBeNull();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await expect(page.getByRole('button', { name: 'Pause expedition' })).toBeVisible();
  // A text input outside any dialog keeps its digits too.
  await page.evaluate(() => { const i = document.createElement('input'); i.id = 'probe-input'; document.body.append(i); i.focus(); });
  await page.keyboard.press('3');
  expect(await page.inputValue('#probe-input')).toBe('3');
  expect(await controls(page)).toBeNull();
  await page.evaluate(() => { const i = document.getElementById('probe-input') as HTMLInputElement; i.blur(); i.remove(); });
  // In play, 3 is Conduct at once, still playing; Numpad 2 is Draw; 1 is Standard again.
  await page.keyboard.press('Digit3');
  await expect(page.getByTestId('lab-surface')).toHaveCount(1, { timeout: 500 });
  expect(await controls(page)).toBe('conduct'); expect(await checkedLab(page)).toBe('conduct');
  await expect(page.getByRole('button', { name: 'Pause expedition' })).toBeVisible();
  await page.keyboard.press('Numpad2');
  await expect.poll(() => controls(page)).toBe('draw');
  await page.keyboard.press('Digit1');
  await expect(page.getByTestId('flight-surface')).toHaveCount(1);
  expect(await controls(page)).toBeNull();
  // Paused, the keys still switch and the game stays paused.
  await page.keyboard.press('Escape');
  await expect(page.getByRole('region', { name: 'Expedition paused' })).toBeVisible();
  await page.keyboard.press('Digit4');
  await expect(bar.locator('[data-lab="brush"]')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('region', { name: 'Expedition paused' })).toBeVisible();
  expect(t.errors).toEqual([]); await t.context.close();
});

test('arrow keys move and select the radio and never turn the view', async ({ browser }) => {
  const t = await labPage(browser, 'standard'), { page } = t, bar = page.getByTestId('lab-bar');
  await lift(page);
  // Control: with focus on the page, a held arrow does turn the view.
  let h0 = await heading(page);
  await page.keyboard.down('ArrowRight'); await page.waitForTimeout(400); await page.keyboard.up('ArrowRight');
  await expect.poll(async () => turned(h0, await heading(page))).toBeGreaterThan(.1);
  await page.waitForTimeout(500);
  // Tab order reaches only the checked segment; the arrows then belong to the group.
  await bar.getByRole('radio', { name: 'Standard' }).focus();
  await expect(bar.locator('[tabindex="0"]')).toHaveCount(1);
  h0 = await heading(page);
  await page.keyboard.down('ArrowRight'); await page.waitForTimeout(400); await page.keyboard.up('ArrowRight');
  await expect(bar.getByRole('radio', { name: 'Draw' })).toBeFocused();
  await expect(bar.getByRole('radio', { name: 'Draw' })).toHaveAttribute('aria-checked', 'true');
  await page.waitForTimeout(700);
  expect(turned(h0, await heading(page))).toBeLessThan(.03);
  await page.keyboard.press('End');
  await expect(bar.getByRole('radio', { name: 'Brush' })).toBeFocused();
  await page.keyboard.press('ArrowRight'); // wraps
  await expect(bar.getByRole('radio', { name: 'Standard' })).toBeFocused();
  await page.keyboard.press('ArrowLeft'); // wraps back
  await expect(bar.getByRole('radio', { name: 'Brush' })).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Home');
  await expect(bar.getByRole('radio', { name: 'Standard' })).toHaveAttribute('aria-checked', 'true');
  expect(turned(h0, await heading(page))).toBeLessThan(.03);
  await expect(page.getByRole('button', { name: 'Pause expedition' })).toBeVisible();
  expect(t.errors).toEqual([]); await t.context.close();
});

test('a Standard to Draw switch mounts the lab surface within 500 ms', async ({ browser }) => {
  const t = await labPage(browser, 'standard'), { page } = t;
  await expect(page.getByTestId('lab-bar')).toBeVisible();
  await page.waitForTimeout(800); // the warmed LabControls chunk
  const ms = await page.evaluate(() => new Promise<number>(resolve => {
    const t0 = performance.now();
    const seen = () => document.querySelector('[data-testid="lab-surface"]');
    new MutationObserver((_, o) => { if (seen()) { o.disconnect(); resolve(performance.now() - t0); } }).observe(document.body, { subtree: true, childList: true });
    (document.querySelector('[data-testid="lab-bar"] [data-lab="draw"]') as HTMLButtonElement).click();
    setTimeout(() => resolve(Infinity), 3000);
  }));
  expect(ms).toBeLessThan(500);
  expect(await controls(page)).toBe('draw');
  expect(t.errors).toEqual([]); await t.context.close();
});

const MATRIX = [
  { width: 1440, height: 900, touch: false }, { width: 1024, height: 768, touch: false }, { width: 325, height: 700, touch: false },
  { width: 852, height: 393, touch: true }, { width: 812, height: 375, touch: true }, { width: 667, height: 375, touch: true },
  { width: 393, height: 852, touch: true }, { width: 375, height: 667, touch: true },
];
// Everything the bar must never cover: header buttons, reticle, hints, discovery, telemetry, Lift/Land, the touch cluster, lab tip.
const OTHERS = ['#field-guide', 'button[aria-label="Flight settings"]', 'button[aria-label="Pause expedition"]', '[class*="reticle"]',
  '[class*="hint" i]', '[class*="discovery"]', '[data-testid="flight-telemetry"]', '[data-testid="touch-layer"] button',
  '[data-testid="touch-layer"] [class*="btn"]', '[class*="tip" i]', 'main button'];

for (const v of MATRIX) {
  test(`layout ${v.width}x${v.height} ${v.touch ? 'touch' : 'mouse'}: no overlaps, inside the viewport, 44 px segments`, async ({ browser }) => {
    const t = await labPage(browser, 'standard', { touch: v.touch, viewport: { width: v.width, height: v.height } }), { page } = t;
    await expect(page.getByTestId('lab-bar')).toBeVisible();
    for (const phase of ['ground', 'air'] as const) {
      if (phase === 'air') await (v.touch ? liftTwin(page) : lift(page));
      const r = await page.evaluate(sel => {
        const bar = document.querySelector('[data-testid="lab-bar"]') as HTMLElement, b = bar.getBoundingClientRect();
        const segs = [...bar.querySelectorAll('[role="radio"]')].map(s => { const q = s.getBoundingClientRect(); return { w: q.width, h: q.height }; });
        const vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight, hits: string[] = [];
        for (const e of document.querySelectorAll<HTMLElement>(sel.join(','))) {
          if (e.contains(bar) || bar.contains(e)) continue;
          const q = e.getBoundingClientRect(), cs = getComputedStyle(e);
          if (!q.width || !q.height || cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) continue;
          if (q.width * q.height > vw * vh * .5) continue; // full-screen layers, not controls
          const x = Math.min(b.right, q.right) - Math.max(b.left, q.left), y = Math.min(b.bottom, q.bottom) - Math.max(b.top, q.top);
          if (x > .5 && y > .5) hits.push(`${e.tagName}.${e.className || e.getAttribute('aria-label') || e.id}`);
        }
        return { b: { l: b.left, t: b.top, r: b.right, btm: b.bottom }, vw, vh, segs, hits, overflow: bar.scrollWidth > bar.clientWidth + 1 };
      }, OTHERS);
      expect(r.hits, `${phase}: overlaps`).toEqual([]);
      expect(r.b.l).toBeGreaterThanOrEqual(0); expect(r.b.t).toBeGreaterThanOrEqual(0);
      expect(r.b.r).toBeLessThanOrEqual(r.vw); expect(r.b.btm).toBeLessThanOrEqual(r.vh);
      expect(r.overflow).toBe(false);
      expect(r.segs).toHaveLength(4);
      for (const s of r.segs) { expect(s.w).toBeGreaterThanOrEqual(44); expect(s.h).toBeGreaterThanOrEqual(44); }
    }
    expect(t.errors).toEqual([]); await t.context.close();
  });
}

for (const touch of [false, true]) {
  test(`axe AA on the bar (${touch ? 'touch' : 'desktop'})`, async ({ browser }) => {
    const t = await labPage(browser, 'standard', { touch }), { page } = t;
    await expect(page.getByTestId('lab-bar')).toBeVisible();
    const scan = () => new AxeBuilder({ page }).include('[data-testid="lab-bar"]').withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect((await scan()).violations).toEqual([]);
    await page.getByTestId('lab-bar').locator('[data-lab="conduct"]').click();
    await expect(page.getByTestId('lab-surface')).toHaveCount(1);
    expect((await scan()).violations).toEqual([]);
    expect(t.errors).toEqual([]); await t.context.close();
  });
}

test('cruising on a desktop, resting the pointer on the lab bar or the Pause button holds the view still', async ({ browser }) => {
  // Review 2026-09-25: the bar and the header buttons sit inside the 72 px top pitch band, and the window listener kept steering over
  // them, so reaching for Brush tipped the view into the sky and reaching for Pause turned it. Over any control the look and the edge
  // turn and pitch now freeze. (Travel across the world on the way still steers: that is the free cursor.) Mouse, not a trackpad.
  const t = await labPage(browser, 'standard'), { page } = t, bar = page.getByTestId('lab-bar');
  await expect(bar).toBeVisible();
  // Seeded 250 px under the header, so the travel up leaves the pitch short of its 1.25 rad clamp and a sustained edge pitch shows.
  await page.mouse.move(720, 300);
  await page.keyboard.press('Space');
  await expect.poll(async () => (await tel(page)).speed, { timeout: 6000 }).toBeGreaterThan(5);
  for (const target of [bar.getByRole('radio', { name: 'Brush' }), page.getByRole('button', { name: 'Pause expedition' })]) {
    const box = (await target.boundingBox())!, x = box.x + box.width / 2, y = box.y + box.height / 2;
    await page.mouse.move(x, y, { steps: 25 });
    await page.waitForTimeout(450); // telemetry is stamped every 350 ms
    const a = await tel(page);
    await page.waitForTimeout(1000);
    const b = await tel(page);
    test.info().annotations.push({ type: 'rest on control', description: `pitch ${a.pitch.toFixed(3)} -> ${b.pitch.toFixed(3)}, heading ${a.heading.toFixed(3)} -> ${b.heading.toFixed(3)}, speed ${b.speed.toFixed(1)}` });
    expect(Math.abs(b.pitch - a.pitch)).toBeLessThan(.02);
    expect(turned(a.heading, b.heading)).toBeLessThan(.02);
    expect(b.speed).toBeGreaterThan(5); // still cruising: resting on a control is not a brake
    await page.mouse.move(720, 300, { steps: 10 });
  }
  expect(t.errors).toEqual([]); await t.context.close();
});
