import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { twinTouchPage } from './shooter-browser';
// Twin touch layout fit on short screens (Safari bars shown, landscape phones, zoomed text) and the pause/leave cards that must
// keep their primary button reachable. Emulated viewports in system Chrome: not iPhone validation.
const axe = async (page: Page) =>
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([]);
async function inside(page: Page, name: string, primary: string) {
  const card = page.getByRole('region', { name }), button = card.getByRole('button', { name: primary });
  await expect(button).toBeVisible();
  const b = (await button.boundingBox())!, v = await page.evaluate(() => ({ w: visualViewport!.width, h: visualViewport!.height }));
  expect(b.x).toBeGreaterThanOrEqual(0); expect(b.y).toBeGreaterThanOrEqual(0);
  expect(b.x + b.width).toBeLessThanOrEqual(v.w + .5); expect(b.y + b.height).toBeLessThanOrEqual(v.h + .5);
}
const SIZES = [{ width: 852, height: 350 }, { width: 844, height: 340 }, { width: 667, height: 320 }, { width: 568, height: 262 }, { width: 393, height: 659 }];
for (const viewport of SIZES) for (const size of [1, 1.2]) test(`${viewport.width}x${viewport.height} at size ${size}: every control inside the bands`, async ({ browser }) => {
  const t = await twinTouchPage(browser, viewport, size === 1 ? undefined : { controlSize: size }), { page } = t;
  const header = (await page.locator('main header').boundingBox())!, v = t.view;
  expect(t.boxes.length).toBeGreaterThanOrEqual(3);
  for (const b of t.boxes) {
    expect(b.y).toBeGreaterThanOrEqual(header.y + header.height);
    expect(b.x).toBeGreaterThanOrEqual(t.bands.l - .5); expect(b.x + b.width).toBeLessThanOrEqual(t.bands.r + .5);
    expect(b.y + b.height).toBeLessThanOrEqual(t.bands.b + .5);
    expect(b.x + b.width).toBeLessThanOrEqual(v.w); expect(b.y + b.height).toBeLessThanOrEqual(v.h);
  }
  if (viewport.width === 568) expect(t.layout).toBe('compact');
  else expect(t.layout).toBe(viewport.width > viewport.height ? 'normal' : 'portrait');
  expect(t.errors).toEqual([]); await t.context.close();
});
for (const viewport of [{ width: 667, height: 320 }, { width: 852, height: 340 }]) test(`${viewport.width}x${viewport.height}: the pause card (with the tip) and the leave card fit, AA clean`, async ({ browser }) => {
  const t = await twinTouchPage(browser, viewport), { page } = t;
  await page.getByRole('button', { name: 'Pause expedition' }).tap();
  await expect(page.getByText('Tip: Share › Add to Home Screen for full screen.')).toBeVisible();
  await inside(page, 'Expedition paused', 'Resume flight');
  const got = page.getByRole('button', { name: 'Got it' }), gb = (await got.boundingBox())!;
  expect(gb.height).toBeGreaterThanOrEqual(44);
  await axe(page);
  await page.getByRole('button', { name: 'Resume flight' }).tap();
  await expect(page.getByRole('button', { name: 'Pause expedition' })).toBeVisible();
  await page.evaluate(() => history.back());
  await expect(page.getByRole('heading', { name: 'Leave the game?' })).toBeVisible();
  await inside(page, 'Leave the game', 'Keep playing'); await axe(page);
  expect(t.errors).toEqual([]); await t.context.close();
});
