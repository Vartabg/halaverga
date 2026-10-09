import { expect, test, type Page } from '@playwright/test';
import { centre, speed, twinGeometry, twinTouchPage } from './shooter-browser';
// Browser protection and the play lifecycle (spec section 4): only leaving the page pauses touch play; Safari's scroll, zoom and
// back gestures are owned while playing and handed back on pause. System Chrome emulation: not iPhone validation.
const pauseCard = (p: Page) => p.getByRole('button', { name: 'Resume flight' });
const pauseButton = (p: Page) => p.getByRole('button', { name: 'Pause expedition' });
const blur = (p: Page) => p.evaluate(() => window.dispatchEvent(new Event('blur')));
const L = { width: 852, height: 393 };
test('touch: a blur mid-drag (focus into a toolbar iframe) keeps the stick and keeps playing', async ({ browser }) => {
  const t = await twinTouchPage(browser, L), { page, touch } = t;
  await touch.down(1, t.stickPoint); await touch.drag(1, 0, -80); await page.waitForTimeout(600);
  expect(await speed(page)).toBeGreaterThan(1);
  await blur(page); await touch.drag(1, 10, -10, 3); await page.waitForTimeout(600);
  await expect(t.surface).toHaveAttribute('data-control-mode', 'move');
  expect(await speed(page)).toBeGreaterThan(1);
  await expect(pauseCard(page)).toHaveCount(0); await expect(pauseButton(page)).toBeVisible();
  await touch.cancel(); await expect(t.surface).toHaveAttribute('data-control-mode', 'idle'); // iOS's own cancel still releases
  expect(t.errors).toEqual([]); await t.context.close();
});
test('touch: Safari toolbar resizes keep the stick; a rotation keeps playing with input released', async ({ browser }) => {
  const t = await twinTouchPage(browser, L), { page, touch } = t;
  await touch.down(1, t.stickPoint); await touch.drag(1, 0, -80); await page.waitForTimeout(700);
  await page.setViewportSize({ width: 852, height: 340 }); await page.waitForTimeout(300);
  await page.setViewportSize(L); await page.waitForTimeout(400);
  await expect(t.surface).toHaveAttribute('data-control-mode', 'move');
  expect(await speed(page)).toBeGreaterThan(1);
  await page.setViewportSize({ width: 393, height: 852 });
  await expect(t.surface).toHaveAttribute('data-layout', 'portrait');
  await expect(t.surface).toHaveAttribute('data-control-mode', 'idle');
  await expect.poll(() => speed(page), { timeout: 1500 }).toBeLessThan(.5);
  await expect(pauseCard(page)).toHaveCount(0); await expect(pauseButton(page)).toBeVisible();
  await touch.cancel(); expect(t.errors).toEqual([]); await t.context.close();
});
test('leaving the page pauses: a hidden visibilitychange, and pagehide (which also saves)', async ({ browser }) => {
  const t = await twinTouchPage(browser, L), { page } = t;
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(pauseCard(page)).toBeVisible();
  await page.evaluate(() => {
    delete (document as unknown as Record<string, unknown>).hidden; delete (document as unknown as Record<string, unknown>).visibilityState;
  });
  await pauseCard(page).tap(); await expect(pauseButton(page)).toBeVisible();
  await page.evaluate(() => { localStorage.removeItem('halaverga-flight-v1'); window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })); });
  await expect(pauseCard(page)).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('halaverga-flight-v1'))).not.toBeNull();
  await t.context.close();
});
test('the page is pinned only while playing; gestures are swallowed without touching input', async ({ browser }) => {
  const t = await twinTouchPage(browser, L), { page, touch, cdp } = t;
  const styles = () => page.evaluate(() => ({ playing: document.documentElement.hasAttribute('data-playing'),
    body: getComputedStyle(document.body).position, canvas: getComputedStyle(document.querySelector('canvas')!).touchAction }));
  expect(await styles()).toEqual({ playing: true, body: 'fixed', canvas: 'none' });
  // A cancelable gesturestart while Fire is held is prevented, and Fire stays held.
  await touch.down(3, centre((await t.fire.boundingBox())!)); await expect(t.fire).toHaveAttribute('data-held', /.*/);
  const prevented = await page.evaluate(() => { const e = new Event('gesturestart', { cancelable: true, bubbles: true }); document.dispatchEvent(e); return e.defaultPrevented; });
  expect(prevented).toBe(true);
  await page.waitForTimeout(200); await expect(t.fire).toHaveAttribute('data-held', /.*/);
  await expect(t.surface).toHaveAttribute('data-fire-held', 'true'); await touch.up(3);
  // A two-finger pinch in play leaves the page scale alone.
  const scale = () => page.evaluate(() => visualViewport!.scale), initial = await scale();
  await cdp.send('Input.synthesizePinchGesture', { x: t.lookPoint.x - 60, y: t.lookPoint.y, scaleFactor: 1.6, relativeSpeed: 600, gestureSourceType: 'touch' });
  expect(await scale()).toBeCloseTo(initial);
  await expect(pauseCard(page)).toHaveCount(0);
  await pauseButton(page).tap(); await expect(pauseCard(page)).toBeVisible();
  expect(await styles()).toEqual({ playing: false, body: 'static', canvas: 'pinch-zoom' });
  await t.context.close();
});
test('a tap on the rightmost 4 px of Pause opens the pause card (no touchstart guard)', async ({ browser }) => {
  const t = await twinTouchPage(browser, L, undefined, { top: 0, right: 59, bottom: 21, left: 59 }), { page, send } = t;
  test.info().annotations.push({ type: 'safe-area override', description: t.insetsApplied ? 'applied' : 'unsupported (zero insets)' });
  const b = (await pauseButton(page).boundingBox())!, x = Math.floor(b.x + b.width - 2), y = Math.round(b.y + b.height / 2);
  await send('touchStart', [{ id: 1, x, y }]); await page.waitForTimeout(60); await send('touchEnd', []);
  await expect(pauseCard(page)).toBeVisible(); await t.context.close();
});
test('zoom guard: Resume while pinch-zoomed resets the zoom or explains, and never starts zoomed', async ({ browser }) => {
  const t = await twinTouchPage(browser, L), { page, cdp } = t;
  await pauseButton(page).tap(); await expect(pauseCard(page)).toBeVisible();
  const card = centre((await page.getByRole('region', { name: 'Expedition paused' }).boundingBox())!);
  await cdp.send('Input.synthesizePinchGesture', { x: Math.round(card.x), y: Math.round(card.y), scaleFactor: 2, relativeSpeed: 600, gestureSourceType: 'touch' });
  const scale = () => page.evaluate(() => visualViewport!.scale);
  await expect.poll(scale).toBeGreaterThan(1.5);
  await pauseCard(page).dispatchEvent('click');
  await expect(page.getByText('Pinch out to normal size, then tap Resume.')).toBeVisible();
  await expect(pauseButton(page)).toHaveCount(0);
  await page.waitForTimeout(300); const after = await scale();
  test.info().annotations.push({ type: 'zoom guard', description: after < 1.01 ? `zoom reset to ${after}; note shown` : `zoom kept (${after}); note shown` });
  if (after < 1.01) {
    await pauseCard(page).tap(); await expect(pauseButton(page)).toBeVisible();
    const g = await twinGeometry(page), vv = await page.evaluate(() => ({ x: visualViewport!.offsetLeft, y: visualViewport!.offsetTop, w: visualViewport!.width, h: visualViewport!.height }));
    for (const b of g.boxes) { expect(b.x).toBeGreaterThanOrEqual(vv.x); expect(b.y + b.height).toBeLessThanOrEqual(vv.y + vv.h); expect(b.x + b.width).toBeLessThanOrEqual(vv.x + vv.w); }
  }
  await t.context.close();
});
test('back swipe: the sentinel turns history.back() into "Leave the game?" without a reload', async ({ browser }) => {
  const t = await twinTouchPage(browser, L), { page } = t;
  expect(await page.evaluate(() => (history.state as { halavergaPlay?: number } | null)?.halavergaPlay)).toBe(1);
  await page.evaluate(() => { (window as unknown as { marker: number }).marker = 7; history.back(); });
  await expect(page.getByRole('heading', { name: 'Leave the game?' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Keep playing' })).toBeFocused();
  expect(await page.evaluate(() => (window as unknown as { marker?: number }).marker)).toBe(7);
  await page.getByRole('button', { name: 'Keep playing' }).tap(); await expect(pauseButton(page)).toBeVisible();
  expect(await page.evaluate(() => (history.state as { halavergaPlay?: number } | null)?.halavergaPlay)).toBe(1);
  expect(t.errors).toEqual([]); await t.context.close();
});
test('back swipe from a fresh tab (nothing to go back to): no sentinel, so an edge swipe cannot pause', async ({ browser }) => {
  const t = await twinTouchPage(browser, L, undefined, undefined, '/', true), { page } = t;
  expect(await page.evaluate(() => (history.state as { halavergaPlay?: number } | null)?.halavergaPlay)).toBeUndefined();
  expect(t.errors).toEqual([]); await t.context.close();
});
test('a back swipe while Flight settings is open leaves no stale "Leave the game?" behind', async ({ browser }) => {
  const t = await twinTouchPage(browser, L), { page } = t;
  await page.getByRole('button', { name: 'Flight settings' }).tap();
  await page.evaluate(() => history.back()); await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'Close dialog' }).tap(); await expect(pauseButton(page)).toBeVisible();
  expect(await page.evaluate(() => (history.state as { halavergaPlay?: number } | null)?.halavergaPlay)).toBe(1); // re-armed
  await pauseButton(page).tap();
  await expect(page.getByRole('region', { name: 'Expedition paused' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Leave the game?' })).toHaveCount(0);
  expect(t.errors).toEqual([]); await t.context.close();
});
test('pointer mode follows the last pointer: after a mouse press a blur pauses, after a touch it does not', async ({ browser }) => {
  const t = await twinTouchPage(browser, L), { page, touch } = t;
  await touch.down(2, t.lookPoint); await touch.up(2);
  await blur(page); await page.waitForTimeout(200); await expect(pauseCard(page)).toHaveCount(0);
  await page.evaluate(() => document.body.dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'mouse', bubbles: true })));
  await expect(page.locator('html')).toHaveAttribute('data-input', 'mouse');
  await blur(page); await expect(pauseCard(page)).toBeVisible(); await t.context.close();
});
test('desktop: Begin pushes no history entry, no fixed page, Back shows no Leave card, and a blur still pauses', async ({ page }) => {
  await page.goto('/'); const length = await page.evaluate(() => history.length);
  await page.getByRole('button', { name: 'Begin expedition' }).click(); await expect(pauseButton(page)).toBeVisible();
  expect(await page.evaluate(() => history.length)).toBe(length);
  expect(await page.evaluate(() => (history.state as { halavergaPlay?: number } | null)?.halavergaPlay)).toBeUndefined();
  expect(await page.evaluate(() => document.documentElement.hasAttribute('data-playing'))).toBe(false); // no fixed page on a desktop
  await page.evaluate(() => history.pushState({ marker: 1 }, '')); await page.evaluate(() => history.back()); await page.waitForTimeout(300);
  await expect(page.getByRole('heading', { name: 'Leave the game?' })).toHaveCount(0);
  await expect(pauseCard(page)).toHaveCount(0); await expect(pauseButton(page)).toBeVisible();
  await blur(page); await expect(pauseCard(page)).toBeVisible();
});
