import { expect, test, type Page } from '@playwright/test';
import { centre, heading, shots, speed, telemetry, twinTouchPage } from './shooter-browser';
import { position } from './flow-browser';
// Twin-stick touch (the default): left thumb = floating move stick, right thumb = look, Fire/Rise/Descend/Aim cluster.
// System Chrome CDP touch against `next start`: emulation, not iPhone validation.
const alt = async (p: Page) => (await position(p))[1];
const flying = (p: Page) => telemetry(p).getAttribute('data-flying');
const THROW = 70; // past the stick radius (64k landscape, 56k portrait) but short of the sprint zone: full normal speed
const SPRINT = 115; // into the sprint zone (1.5 R or more above the base: 96 px landscape, 84 portrait): boost
type T = Awaited<ReturnType<typeof twinTouchPage>>;
async function liftOff(t: T) {
  const r = centre((await t.rise.boundingBox())!);
  await t.touch.down(4, r); await t.page.waitForTimeout(120); await t.touch.up(4);
  await expect(telemetry(t.page)).toHaveAttribute('data-flying', 'true');
}
async function holdButton(t: T, id: number, button: T['rise'], ms: number) {
  await t.touch.down(id, centre((await button.boundingBox())!)); await t.page.waitForTimeout(ms); await t.touch.up(id);
}
async function settle(p: Page) { await expect.poll(() => speed(p), { timeout: 4000 }).toBeLessThan(.5); }
async function doubleTap(t: T) {
  for (let i = 0; i < 2; i++) { await t.touch.down(1, t.stickPoint); await t.page.waitForTimeout(60); await t.touch.up(1); await t.page.waitForTimeout(110); }
}
for (const viewport of [{ width: 852, height: 393 }, { width: 393, height: 852 }]) test.describe(`twin ${viewport.width}x${viewport.height}`, () => {
  test('fresh storage: four labelled buttons and the ghost, no Lift/Land, every button 12 px or more from the edges', async ({ browser }) => {
    const t = await twinTouchPage(browser, viewport), { page } = t;
    for (const b of [t.fire, t.rise, t.descend, t.aim]) await expect(b).toBeVisible();
    await expect(page.getByTestId('touch-ghost')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Lift', exact: true })).toBeHidden();
    expect(t.boxes).toHaveLength(4);
    for (const b of t.boxes) {
      expect(b.x).toBeGreaterThanOrEqual(12); expect(b.x + b.width).toBeLessThanOrEqual(viewport.width - 12);
      expect(b.y + b.height).toBeLessThanOrEqual(viewport.height - 12);
    }
    // First-use labels (the accessible names contain them): gone once each button has been used.
    for (const [b, text] of [[t.fire, 'Fire'], [t.aim, 'Aim'], [t.rise, 'Lift off'], [t.descend, /^(Descend|Land)$/]] as const) await expect(b).toHaveText(text);
    await t.touch.down(3, centre((await t.fire.boundingBox())!)); await t.touch.up(3);
    await expect(t.fire).toHaveText(''); await expect(t.aim).toHaveText('Aim');
    expect(t.errors).toEqual([]); await t.context.close();
  });
  test('the stick appears under the thumb; on the ground a full throw walks', async ({ browser }) => {
    const t = await twinTouchPage(browser, viewport), { page, touch, stickPoint } = t;
    await touch.down(1, stickPoint);
    await expect(t.surface).toHaveAttribute('data-control-mode', 'move');
    const stick = centre((await page.getByTestId('touch-stick').boundingBox())!);
    expect(Math.abs(stick.x - stickPoint.x)).toBeLessThan(4); expect(Math.abs(stick.y - stickPoint.y)).toBeLessThan(4);
    await touch.drag(1, 0, -THROW); await page.waitForTimeout(1200);
    expect(await flying(page)).toBe('false');
    const v = await speed(page); expect(v).toBeGreaterThan(1); expect(v).toBeLessThanOrEqual(5.5);
    await touch.up(1); await t.context.close();
  });
  test('Rise lifts off and climbs, Descend drops, both held hover; a Rise drag also looks', async ({ browser }) => {
    const t = await twinTouchPage(browser, viewport), { page } = t;
    await liftOff(t); await settle(page);
    let before = await alt(page); await holdButton(t, 4, t.rise, 1000); expect(await alt(page)).toBeGreaterThan(before + 4);
    await settle(page); before = await alt(page); await holdButton(t, 5, t.descend, 700);
    expect(await alt(page)).toBeLessThan(before - 2);
    await settle(page);
    await t.touch.down(4, centre((await t.rise.boundingBox())!)); await t.touch.down(5, centre((await t.descend.boundingBox())!));
    await page.waitForTimeout(800); before = await alt(page); await page.waitForTimeout(1000);
    expect(Math.abs(await alt(page) - before)).toBeLessThan(.5);
    await t.touch.up(5); await t.touch.up(4); await settle(page);
    // Hold Rise and drag it 100 px: the suit climbs while the view turns.
    const h0 = await heading(page); before = await alt(page);
    await t.touch.down(4, centre((await t.rise.boundingBox())!)); await t.touch.drag(4, -100, 0); await page.waitForTimeout(700);
    expect(await alt(page)).toBeGreaterThan(before + 2); expect(Math.abs(await heading(page) - h0)).toBeGreaterThan(.3);
    await t.touch.up(4); expect(t.errors).toEqual([]); await t.context.close();
  });
  test('a 100 px look-pad drag turns .52 rad (aim assist and look acceleration off); a touch in the side band is ignored', async ({ browser }) => {
    // v5 saves keep their choices: look acceleration off pins the exact 1:1 gain (fast swipes turn further with it on).
    const t = await twinTouchPage(browser, viewport, { aimAssist: 0, lookAccel: false, controlsVersion: 5 }), { page, touch } = t;
    await page.waitForTimeout(400); const h0 = await heading(page);
    await touch.down(2, t.lookPoint); await expect(t.surface).toHaveAttribute('data-control-mode', 'look');
    await touch.drag(2, 100, 0); await touch.up(2); await page.waitForTimeout(450);
    expect(Math.abs(await heading(page) - h0 - -.52)).toBeLessThan(.06);
    const h1 = await heading(page);
    await touch.down(3, { x: 10, y: t.stickPoint.y }); await touch.drag(3, 60, -60); await page.waitForTimeout(450);
    await expect(t.surface).toHaveAttribute('data-control-mode', 'idle');
    await expect(page.getByTestId('touch-stick')).toBeHidden();
    expect(await heading(page)).toBe(h1); expect(await speed(page)).toBeLessThan(.2);
    await touch.up(3); await t.context.close();
  });
  for (const fly of [false, true]) test(`level flight ${fly ? 'off (Fly where I look)' : 'on'}: forward at a -.52 view pitch`, async ({ browser }) => {
    const t = await twinTouchPage(browser, viewport, fly ? { flyWhereILook: true } : undefined), { page, touch } = t;
    await liftOff(t); await holdButton(t, 4, t.rise, 1200); await settle(page);
    await touch.down(2, t.lookPoint); await touch.drag(2, 0, Math.round(.4 / (.0052 * .8))); await touch.up(2);
    await page.waitForTimeout(400); expect(Number(await telemetry(page).getAttribute('data-pitch'))).toBeLessThan(-.4);
    const before = await alt(page);
    await touch.down(1, t.stickPoint); await touch.drag(1, 0, -THROW, 4); await page.waitForTimeout(1000);
    const change = await alt(page) - before; await touch.up(1);
    if (fly) expect(change).toBeLessThan(-2); else expect(Math.abs(change)).toBeLessThan(.6);
    await t.context.close();
  });
  test('five fingers at once: all kept; a touch cancel releases every one without pausing', async ({ browser }) => {
    const t = await twinTouchPage(browser, viewport), { page, touch } = t;
    await liftOff(t); await settle(page); const s0 = await shots(page);
    await touch.down(1, t.stickPoint); await touch.down(2, t.lookPoint);
    await touch.down(3, centre((await t.fire.boundingBox())!)); await touch.down(4, centre((await t.rise.boundingBox())!));
    await touch.down(5, centre((await t.descend.boundingBox())!));
    await touch.move(1, { x: t.stickPoint.x, y: t.stickPoint.y - 40 }); await touch.move(2, { x: t.lookPoint.x - 20, y: t.lookPoint.y });
    await page.waitForTimeout(1500);
    await expect(t.surface).toHaveAttribute('data-control-mode', 'dual');
    await expect(t.surface).toHaveAttribute('data-fire-held', 'true');
    for (const b of [t.fire, t.rise, t.descend]) await expect(b).toHaveAttribute('data-held', /.*/);
    expect(await shots(page)).toBeGreaterThan(s0);
    await touch.cancel(); await page.waitForTimeout(300);
    await expect(t.surface).toHaveAttribute('data-control-mode', 'idle');
    await expect(t.surface).toHaveAttribute('data-fire-held', 'false');
    for (const b of [t.fire, t.rise, t.descend]) await expect(b).not.toHaveAttribute('data-held', /.*/);
    await expect(page.getByRole('button', { name: 'Resume flight' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Pause expedition' })).toBeVisible();
    expect(t.errors).toEqual([]); await t.context.close();
  });
  test('a thumb held on the rim flies at 13 m/s and never boosts', async ({ browser }) => {
    const t = await twinTouchPage(browser, viewport), { page, touch } = t;
    await liftOff(t); await holdButton(t, 4, t.rise, 600); await settle(page);
    await touch.down(1, t.stickPoint); await touch.drag(1, 0, -THROW, 4); await page.waitForTimeout(2200);
    await expect(t.surface).toHaveAttribute('data-boost', 'false');
    const v = await speed(page); expect(v).toBeGreaterThan(11); expect(v).toBeLessThan(15);
    await touch.up(1); await t.context.close();
  });
  test('cruise holds about 13 m/s hands-free; a push into the sprint zone from it boosts', async ({ browser }) => {
    const t = await twinTouchPage(browser, viewport), { page, touch } = t;
    await liftOff(t); await holdButton(t, 4, t.rise, 600); await settle(page);
    await doubleTap(t); await expect(t.surface).toHaveAttribute('data-cruise', 'true');
    await page.waitForTimeout(2500); let v = await speed(page); expect(v).toBeGreaterThan(11.5); expect(v).toBeLessThan(14.5);
    await touch.down(1, t.stickPoint); await expect(page.getByTestId('touch-sprint')).toBeVisible();
    await touch.drag(1, 0, -SPRINT, 3);
    await expect(t.surface).toHaveAttribute('data-boost', 'true', { timeout: 400 });
    // 700 ms from the cue, plus up to one 350 ms telemetry sample.
    await expect.poll(() => speed(page), { timeout: 1050, intervals: [50] }).toBeGreaterThan(20);
    v = await speed(page); await touch.up(1); expect(v).toBeGreaterThan(20); await t.context.close();
  });
  test('Fire is visible with auto-fire on, and a Fire drag turns the view', async ({ browser }) => {
    const t = await twinTouchPage(browser, viewport), { page, touch } = t;
    await expect(t.fire).toBeVisible(); await page.waitForTimeout(400); const h0 = await heading(page);
    await touch.down(3, centre((await t.fire.boundingBox())!)); await touch.drag(3, -100, 0); await page.waitForTimeout(450);
    expect(await heading(page) - h0).toBeGreaterThan(.3); await touch.up(3); await t.context.close();
  });
  // Measured at 61 fps: about 3.35 s from the press (coast-up after Rise, 9.1 m/s descent, then main's eased landing approach).
  test('hold Descend from about 10 m and the suit lands within 4.5 s', async ({ browser }) => {
    const t = await twinTouchPage(browser, viewport), { page, touch } = t;
    const ground = await alt(page); await liftOff(t);
    await touch.down(4, centre((await t.rise.boundingBox())!));
    await expect.poll(() => alt(page), { timeout: 5000, intervals: [50] }).toBeGreaterThan(ground + 10); await touch.up(4);
    await touch.down(5, centre((await t.descend.boundingBox())!));
    await expect(telemetry(page)).toHaveAttribute('data-flying', 'false', { timeout: 4500 });
    await touch.up(5); expect(t.errors).toEqual([]); await t.context.close();
  });
  test('tap controls on: no ghost, a left-side drag looks, and Rise and Descend still lift off and land', async ({ browser }) => {
    const t = await twinTouchPage(browser, viewport, { tapControls: true }), { page, touch } = t;
    await expect(page.getByTestId('touch-ghost')).toBeHidden();
    await expect(t.rise).toBeVisible(); await expect(t.descend).toBeVisible();
    await page.waitForTimeout(400); const h0 = await heading(page);
    await touch.down(1, { x: Math.round(viewport.width * .3), y: Math.round(t.bands.t + 50) });
    await expect(t.surface).toHaveAttribute('data-control-mode', 'look');
    await touch.drag(1, 100, 0); await touch.up(1); await page.waitForTimeout(450);
    expect(Math.abs(await heading(page) - h0)).toBeGreaterThan(.3);
    const ground = await alt(page); await liftOff(t);
    await touch.down(4, centre((await t.rise.boundingBox())!));
    await expect.poll(() => alt(page), { timeout: 5000, intervals: [50] }).toBeGreaterThan(ground + 8); await touch.up(4);
    await touch.down(5, centre((await t.descend.boundingBox())!));
    await expect(telemetry(page)).toHaveAttribute('data-flying', 'false', { timeout: 6000 });
    await touch.up(5); expect(t.errors).toEqual([]); await t.context.close();
  });
  test('lifting Fire while the stick is held releases Fire only (one finger lifts, the others stay)', async ({ browser }) => {
    const t = await twinTouchPage(browser, viewport), { touch } = t;
    await touch.down(1, t.stickPoint); await touch.drag(1, 0, -40, 3);
    await touch.down(3, centre((await t.fire.boundingBox())!)); await expect(t.surface).toHaveAttribute('data-fire-held', 'true');
    await touch.up(3);
    await expect(t.surface).toHaveAttribute('data-fire-held', 'false'); await expect(t.fire).not.toHaveAttribute('data-held', /.*/);
    await expect(t.surface).toHaveAttribute('data-control-mode', 'move');
    await touch.up(1); await expect(t.surface).toHaveAttribute('data-control-mode', 'idle'); await t.context.close();
  });
});

test('iPhone 15 landscape insets: thumbs resting near the edges still start the stick and look; Fire sits ~118 px in', async ({ browser }) => {
  const t = await twinTouchPage(browser, { width: 852, height: 393 }, undefined, { top: 0, right: 59, bottom: 21, left: 59 }), { page, touch } = t;
  test.info().annotations.push({ type: 'safe-area override', description: t.insetsApplied ? 'applied' : 'unsupported (zero insets)' });
  for (const [p, mode] of [[{ x: 70, y: 300 }, 'move'], [{ x: 150, y: 355 }, 'move'], [{ x: 790, y: 250 }, 'look'], [{ x: 610, y: 360 }, 'look']] as const) {
    await touch.down(1, p); await expect(t.surface, JSON.stringify(p)).toHaveAttribute('data-control-mode', mode); await touch.up(1);
  }
  await touch.down(1, { x: 5, y: 300 }); await expect(t.surface).toHaveAttribute('data-control-mode', 'idle'); await touch.up(1);
  const f = centre((await t.fire.boundingBox())!);
  expect(852 - f.x).toBeGreaterThanOrEqual(110); expect(852 - f.x).toBeLessThanOrEqual(130);
  expect(t.errors).toEqual([]); await page.context().close();
});
