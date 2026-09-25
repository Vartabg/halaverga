import { expect, test, type Browser, type Page } from '@playwright/test';
import { begin, seed } from './shooter-browser';
// A desktop that has never shown touch (system Chrome, hasTouch false: maxTouchPoints 0, fine pointer) gets none of the touch
// layer and none of the touch-only browser guards: no fixed page, no history sentinel or "Leave the game?", no document-level
// gesture blockers, no blaster sound popup in the default free trackpad profile. Emulation only; the pane width matches Garo's.
const TOUCH_UI = ['[data-testid="touch-layer"]', '[data-testid="touch-stick"]', '[data-testid="touch-ghost"]',
  '[data-testid="rise-button"]', '[data-testid="fire-button"]', '[data-shooter-controls]'];
const SAVES: [string, Record<string, unknown>][] = [
  ['twin (default touch scheme)', { shooter: true, trackpadSteering: 'free', controlsVersion: 4 }],
  ['classic touch scheme', { shooter: true, touchScheme: 'classic', trackpadSteering: 'free', controlsVersion: 4 }],
];
const VIEWPORTS = [{ width: 1440, height: 900 }, { width: 325, height: 928 }];
const pauseCard = (p: Page) => p.getByRole('button', { name: 'Resume flight' });
const pauseButton = (p: Page) => p.getByRole('button', { name: 'Pause expedition' });

async function expectNoTouchUi(page: Page) {
  for (const selector of TOUCH_UI) await expect(page.locator(selector), selector).toHaveCount(0);
}
async function desktopPage(browser: Browser, viewport: { width: number; height: number }, saved: Record<string, unknown>) {
  const context = await browser.newContext({ viewport, hasTouch: false, isMobile: false });
  const page = await context.newPage(), errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await seed(page, saved);
  // Record the sound popup if it ever appears (it is a transient message, so a single check after the fact could miss it).
  await page.addInitScript(() => {
    const w = window as unknown as { soundNote?: boolean };
    new MutationObserver(() => { if (document.body?.textContent?.includes('Blaster sound is off')) w.soundNote = true; })
      .observe(document, { subtree: true, childList: true, characterData: true });
  });
  await begin(page);
  return { context, page, errors };
}

for (const viewport of VIEWPORTS) for (const [name, saved] of SAVES) {
  test(`desktop ${viewport.width}x${viewport.height}, ${name}: no touch UI, no touch guards, no sound popup`, async ({ browser }) => {
    const { context, page, errors } = await desktopPage(browser, viewport, saved);
    expect(await page.evaluate(() => navigator.maxTouchPoints)).toBe(0);
    await expectNoTouchUi(page);
    const root = () => page.evaluate(() => ({ playing: document.documentElement.hasAttribute('data-playing'),
      input: document.documentElement.dataset.input, body: getComputedStyle(document.body).position }));
    expect(await root()).toEqual({ playing: false, input: 'mouse', body: 'static' });

    // A pen (or any synthetic non-mouse pointer) cannot turn a non-touch desktop into touch mode.
    await page.evaluate(() => document.body.dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'pen', bubbles: true })));
    await page.waitForTimeout(150);
    expect((await root()).input).toBe('mouse');
    await expectNoTouchUi(page);

    // Back is ordinary navigation: no sentinel, no "Leave the game?", no pause.
    expect(await page.evaluate(() => (history.state as { halavergaPlay?: number } | null)?.halavergaPlay)).toBeUndefined();
    await page.evaluate(() => history.pushState({ marker: 1 }, ''));
    await page.evaluate(() => history.back()); await page.waitForTimeout(300);
    await expect(page.getByText('Leave the game?')).toHaveCount(0);
    await expect(pauseCard(page)).toHaveCount(0); await expect(pauseButton(page)).toBeVisible();

    // Holding C fires, and the free trackpad profile never pops the sound notice.
    await page.keyboard.down('KeyC'); await page.waitForTimeout(1000); await page.keyboard.up('KeyC');
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => (window as unknown as { soundNote?: boolean }).soundNote ?? false)).toBe(false);
    await expect(page.getByText('Blaster sound is off')).toHaveCount(0);

    // A right click never pauses (main's own onContextMenu, unchanged since 7945430, still keeps the menu off the scene).
    await page.mouse.click(Math.round(viewport.width / 2), Math.round(viewport.height / 2), { button: 'right' });
    await page.waitForTimeout(200);
    await expect(pauseCard(page)).toHaveCount(0); await expect(pauseButton(page)).toBeVisible();
    await expectNoTouchUi(page);
    expect(errors).toEqual([]);
    await context.close();
  });
}
